require('dotenv').config();
const config = require('./config');
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ActivityType, ChannelType, PermissionFlagsBits } = require('discord.js'); 

const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('Discord Music Bot is running!');
});

const PORT = process.env.PORT || config.express.port;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Express server running on port ${PORT}`);
});

const { Shoukaku, Connectors } = require('shoukaku');
const { Kazagumo } = require('kazagumo');

const intents = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildVoiceStates,
];

if (config.enablePrefix) {
  intents.push(GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent);
}

const client = new Client({ intents });
const shoukaku = new Shoukaku(new Connectors.DiscordJS(client), config.lavalink.nodes);

const kazagumo = new Kazagumo({
  defaultSearchEngine: config.lavalink.defaultSearchEngine,
  send: (guildId, payload) => {
    const guild = client.guilds.cache.get(guildId);
    if (guild) guild.shard.send(payload);
  }
}, new Connectors.DiscordJS(client), config.lavalink.nodes);

// --- CONFIGURATION ---
const OWNER_ID = config.OWNER_ID;
const SONG_NOTIFICATION_CHANNEL_ID = '1411369713266589787'; 
const BOT_JOIN_NOTIFICATION_CHANNEL_ID = '1411369682459427006';
const MUSIC_STOPPED_CHANNEL_ID = '1393633652537163907';
const BOT_LEFT_SERVER_CHANNEL_ID = '1393633926031085669';
const LAVALINK_STATUS_CHANNEL_ID = config.LAVALINK_STATUS_CHANNEL_ID || '1389121367332622337'; 

// --- UTILITY: Formatting & Clearing ---
function msToTime(duration) {
    if (!duration || duration < 0) return '0s';
    const seconds = Math.floor((duration / 1000) % 60);
    const minutes = Math.floor((duration / (1000 * 60)) % 60);
    const hours = Math.floor((duration / (1000 * 60 * 60)) % 24);
    const days = Math.floor((duration / (1000 * 60 * 60 * 24)));
    return days > 0 ? `${days}d ${hours}h ${minutes}m` : `${hours}h ${minutes}m ${seconds}s`;
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

// --- NEW PERSISTENT STATUS SYSTEM ---
let statusMessage = null;

async function updateLavalinkStatus() {
    const channel = client.channels.cache.get(LAVALINK_STATUS_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) return;

    let nodeStatusText = "";
    let overallStatus = " Operational";

    shoukaku.nodes.forEach((node) => {
        const isOnline = node.state === 1; // 1 = CONNECTED
        const statusEmoji = isOnline ? "" : "";
        if (!isOnline) overallStatus = " Partial Operational";

        let statsLine = (isOnline && node.stats) ? 
            `\`\`\`\nPlayers         :: ${node.stats.players}\nPlaying Players :: ${node.stats.playingPlayers}\nUptime          :: ${msToTime(node.stats.uptime)}\nMemory Usage    :: ${Math.round(node.stats.memory.used / 1024 / 1024)} MB / ${Math.round(node.stats.memory.reservable / 1024 / 1024)} MB\nSystem Load     :: ${(node.stats.cpu.systemLoad * 100).toFixed(2)}%\nLavalink Load   :: ${(node.stats.cpu.lavalinkLoad * 100).toFixed(2)}%\n\`\`\`` 
            : "\n **Not Operational**\n";

        nodeStatusText += `\n###  Node: ${node.name}\n${statusEmoji} **${isOnline ? "Operational" : "Offline"}**\n${statsLine}`;
    });

    const statusEmbed = new EmbedBuilder()
        .setAuthor({ name: "Infinity Music Audio Nodes", iconURL: client.user.displayAvatarURL() })
        .setColor(overallStatus.includes("") ? "#2B2D31" : "#E67E22")
        .setDescription(`** ${overallStatus}**\n**Last Refresh:** <t:${Math.floor(Date.now() / 1000)}:R>\n**Auto-Refresh Interval:** 60s\n\n---\n${nodeStatusText}\n---\n**InfinityStats � Rick Developers <3!**`)
        .setTimestamp();

    try {
        if (!statusMessage) {
            const messages = await channel.messages.fetch({ limit: 10 });
            statusMessage = messages.find(m => m.author.id === client.user.id && m.embeds.length > 0);
            if (statusMessage) await statusMessage.edit({ embeds: [statusEmbed] });
            else statusMessage = await channel.send({ embeds: [statusEmbed] });
        } else {
            await statusMessage.edit({ embeds: [statusEmbed] });
        }
    } catch (e) { console.error("Status Refresh Error:", e.message); }
}

// --- EVENT HANDLERS ---
client.on('ready', () => {
    console.log(`${client.user.tag} is online!`);
    client.user.setActivity({ name: config.activity.name, type: ActivityType[config.activity.type] });

    // Start Status Loop
    updateLavalinkStatus();
    setInterval(updateLavalinkStatus, 60000);

    // Command Registration (Truncated for space, keep your original /play, /skip etc logic here)
});

// Shoukaku Node Events (Simplified to trigger status refresh)
shoukaku.on('ready', (name) => { console.log(`Node ${name} Ready`); updateLavalinkStatus(); });
shoukaku.on('error', (name, error) => { console.error(`Node ${name} Error: ${error}`); updateLavalinkStatus(); });
shoukaku.on('close', (name) => { updateLavalinkStatus(); });

// Kazagumo Music Events
kazagumo.on('playerStart', async (player, track) => {
    const channel = client.channels.cache.get(player.textId);
    if (!channel) return;

    const embed = new EmbedBuilder()
        .setTitle(`${config.emojis.nowplaying} ${track.title}`)
        .setURL(track.uri)
        .setThumbnail(track.thumbnail || null)
        .setColor('#2B2D31')
        .addFields(
            { name: 'Artist', value: ` **${track.author || 'Unknown'}**`, inline: true },
            { name: 'Requested by', value: ` **${track.requester.tag}**`, inline: true },
            { name: 'Duration', value: ` **${msToTime(track.duration)}**`, inline: true }
        )
        .setTimestamp();

    const controls = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('pause').setLabel('Pause').setStyle(ButtonStyle.Primary).setEmoji(config.emojis.pause),
        new ButtonBuilder().setCustomId('stop').setLabel('Stop').setStyle(ButtonStyle.Danger).setEmoji(config.emojis.stop),
        new ButtonBuilder().setCustomId('skip').setLabel('Skip').setStyle(ButtonStyle.Secondary).setEmoji(config.emojis.skip)
    );

    const msg = await channel.send({ embeds: [embed], components: [controls] });
    player.data.set('currentMessage', msg);
});

kazagumo.on('playerDestroy', async (player) => {
    await clearBotMessages(player.textId);
});

// --- REMAINING SLASH COMMAND LOGIC ---
// [Include the rest of your original Slash Command handlers and Button interaction code here]

client.login(config.token);
