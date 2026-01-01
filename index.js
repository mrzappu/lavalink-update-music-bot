require('dotenv').config();
const config = require('./config');
const { 
    Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, 
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, 
    ActivityType 
} = require('discord.js'); 

const express = require('express');
const app = express();

app.get('/', (req, res) => { res.send('Discord Music Bot is running!'); });
const PORT = process.env.PORT || config.express.port;
app.listen(PORT, '0.0.0.0', () => { console.log(`Express server running on port ${PORT}`); });

const { Shoukaku, Connectors } = require('shoukaku');
const { Kazagumo } = require('kazagumo');

const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates];
if (config.enablePrefix) intents.push(GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent);

const client = new Client({ intents });
const shoukaku = new Shoukaku(new Connectors.DiscordJS(client), config.lavalink.nodes);

const kazagumo = new Kazagumo({
  defaultSearchEngine: config.lavalink.defaultSearchEngine,
  send: (guildId, payload) => {
    const guild = client.guilds.cache.get(guildId);
    if (guild) guild.shard.send(payload);
  }
}, new Connectors.DiscordJS(client), config.lavalink.nodes);

const LAVALINK_STATUS_CHANNEL_ID = config.LAVALINK_STATUS_CHANNEL_ID;

// --- UTILITIES ---
function msToTime(duration) {
    if (!duration || duration < 0) return '0s';
    const seconds = Math.floor((duration / 1000) % 60);
    const minutes = Math.floor((duration / (1000 * 60)) % 60);
    const hours = Math.floor((duration / (1000 * 60 * 60)) % 24);
    return hours > 0 ? `${hours}h ${minutes}m ${seconds}s` : `${minutes}m ${seconds}s`;
}

async function clearBotMessages(channelId) {
    const channel = client.channels.cache.get(channelId);
    if (!channel || !channel.isTextBased()) return;
    try {
        const messages = await channel.messages.fetch({ limit: 100 });
        const botMessages = messages.filter(m => m.author.id === client.user.id);
        if (botMessages.size > 0) await channel.bulkDelete(botMessages, true);
    } catch (error) { console.error('Clear error:', error.message); }
}

// --- STATUS SYSTEM ---
let statusMessage = null;
async function updateLavalinkStatus() {
    const channel = client.channels.cache.get(LAVALINK_STATUS_CHANNEL_ID);
    if (!channel) return;

    let nodeStatusText = "";
    shoukaku.nodes.forEach((node) => {
        const isOnline = node.state === 1;
        nodeStatusText += `\n### Node: ${node.name}\n**${isOnline ? "✅ Operational" : "❌ Offline"}**\n`;
        if (isOnline && node.stats) {
            nodeStatusText += `\`\`\`\nPlayers: ${node.stats.players}\nUptime: ${msToTime(node.stats.uptime)}\n\`\`\``;
        }
    });

    const statusEmbed = new EmbedBuilder()
        .setAuthor({ name: "Infinity Music Nodes", iconURL: client.user.displayAvatarURL() })
        .setColor("#2B2D31")
        .setDescription(`${nodeStatusText}\n**Last Refresh:** <t:${Math.floor(Date.now() / 1000)}:R>`)
        .setTimestamp();

    try {
        if (!statusMessage) {
            const messages = await channel.messages.fetch({ limit: 5 });
            statusMessage = messages.find(m => m.author.id === client.user.id);
            if (statusMessage) await statusMessage.edit({ embeds: [statusEmbed] });
            else statusMessage = await channel.send({ embeds: [statusEmbed] });
        } else {
            await statusMessage.edit({ embeds: [statusEmbed] });
        }
    } catch (e) { console.error("Status Error:", e.message); }
}

// --- READY EVENT & COMMAND REGISTRATION ---
client.on('ready', async () => {
    console.log(`${client.user.tag} is online!`);
    client.user.setActivity({ name: config.activity.name, type: ActivityType[config.activity.type] });

    const commands = [
        new SlashCommandBuilder()
            .setName('play')
            .setDescription('Play music')
            .addStringOption(opt => opt.setName('query').setDescription('Song name/URL').setRequired(true)),
        new SlashCommandBuilder().setName('skip').setDescription('Skip current song'),
        new SlashCommandBuilder().setName('stop').setDescription('Stop and leave'),
    ].map(c => c.toJSON());

    const rest = new REST({ version: '10' }).setToken(config.token);
    try {
        await rest.put(Routes.applicationGuildCommands(client.user.id, config.GUILD_ID), { body: commands });
        console.log(`Commands registered to server: ${config.GUILD_ID}`);
    } catch (e) { console.error(e); }

    updateLavalinkStatus();
    setInterval(updateLavalinkStatus, 60000);
});

// --- INTERACTION HANDLER ---
client.on('interactionCreate', async (interaction) => {
    const player = kazagumo.players.get(interaction.guildId);

    // Handle Slash Commands
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'play') {
            await interaction.deferReply();
            const query = interaction.options.getString('query');
            if (!interaction.member.voice.channel) return interaction.editReply("Join a VC first!");

            const res = await kazagumo.search(query, { requester: interaction.user });
            if (!res.tracks.length) return interaction.editReply("No results!");

            const newPlayer = await kazagumo.createPlayer({
                guildId: interaction.guildId,
                textId: interaction.channelId,
                voiceId: interaction.member.voice.channel.id,
                deaf: true
            });

            newPlayer.queue.add(res.tracks[0]);
            if (!newPlayer.playing) newPlayer.play();
            return interaction.editReply(`Added **${res.tracks[0].title}** to queue!`);
        }

        if (interaction.commandName === 'skip') {
            if (!player) return interaction.reply("Nothing playing.");
            player.skip();
            return interaction.reply("Skipped!");
        }

        if (interaction.commandName === 'stop') {
            if (!player) return interaction.reply("Nothing playing.");
            player.destroy();
            return interaction.reply("Stopped and disconnected.");
        }
    }

    // Handle Button Interactions
    if (interaction.isButton()) {
        if (!player) return interaction.reply({ content: "No active player.", ephemeral: true });
        
        switch (interaction.customId) {
            case 'pause':
                player.pause(!player.paused);
                await interaction.reply({ content: player.paused ? "Paused!" : "Resumed!", ephemeral: true });
                break;
            case 'skip':
                player.skip();
                await interaction.reply({ content: "Skipped via button!", ephemeral: true });
                break;
            case 'stop':
                player.destroy();
                await interaction.reply({ content: "Stopped via button!", ephemeral: true });
                break;
        }
    }
});

// --- MUSIC EVENTS ---
kazagumo.on('playerStart', async (player, track) => {
    const channel = client.channels.cache.get(player.textId);
    const embed = new EmbedBuilder()
        .setTitle(`${config.emojis.nowplaying} Now Playing`)
        .setDescription(`[${track.title}](${track.uri})\nRequested by: ${track.requester}`)
        .setColor("#2B2D31");

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('pause').setEmoji(config.emojis.pause).setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('skip').setEmoji(config.emojis.skip).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('stop').setEmoji(config.emojis.stop).setStyle(ButtonStyle.Danger)
    );

    const msg = await channel.send({ embeds: [embed], components: [row] });
    player.data.set('msgId', msg.id);
});

kazagumo.on('playerDestroy', (player) => { clearBotMessages(player.textId); });

client.login(config.token);
