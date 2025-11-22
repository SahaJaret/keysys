// server.js
// node server.js

import express from "express";
import crypto from "crypto";
import { MongoClient } from "mongodb";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===================== CONFIG =====================
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const WORKINK_LINK =
  process.env.WORKINK_LINK || "https://workink.net/26ij/6z67dpqo";
const YOUTUBE_CHANNEL =
  process.env.YT_CHANNEL || "https://www.youtube.com/@yourchannel";

const DISCORD_WEBHOOK_URL =
  process.env.DISCORD_WEBHOOK_URL ||
  "https://discord.com/api/webhooks/1437260058055671951/MsGGD615b_pwsrPKBRj7HUJlgZFhtviijHQq8GErQmjI_uZ7g2NKYfATP7VKOqWIEL2t";

// ===================== DYNAMIC BASE URL =====================
// Automatically detects the server URL based on environment
function getServerUrl() {
  // 1. If BASE_URL is set in .env - use it (for production)
  if (process.env.BASE_URL) {
    return process.env.BASE_URL;
  }
  
  // 2. If on Render.com - auto-detect
  if (process.env.RENDER) {
    return `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`;
  }
  
  // 3. Default to localhost for development
  return "http://localhost:3000";
}

const BASE_URL = getServerUrl();
console.log("🌐 Server URL:", BASE_URL);

// ===================== MONGODB CONNECTION =====================
// Измени MongoDB URI здесь! Не нужно добавлять в Environment Variables!
const MONGODB_URI = "mongodb+srv://sahajaret_db_user:M7aayGpyV8g86J6q@cluster0.imymvgf.mongodb.net/key_management?retryWrites=true&w=majority";

// MongoDB client options - compatible with MongoDB 5.x and Node.js 20
const mongoOptions = {
  serverSelectionTimeoutMS: 30000,
  connectTimeoutMS: 30000,
  socketTimeoutMS: 45000,
};

const client = new MongoClient(MONGODB_URI, mongoOptions);

let db;
let keysCollection;
let logsCollection;
let eventsCollection;
let trafficCollection;
let checkpointsCollection;
let monetizationProvidersCollection;
let scriptsCollection;
let settingsCollection;
let geoStatsCollection;

async function connectDB() {
  try {
    await client.connect();
    console.log("✅ Connected to MongoDB");
    db = client.db("key_management");
    keysCollection = db.collection("keys");
    logsCollection = db.collection("check_logs");
    eventsCollection = db.collection("events");
    trafficCollection = db.collection("traffic");
    checkpointsCollection = db.collection("checkpoints");
    monetizationProvidersCollection = db.collection("monetization_providers");
    scriptsCollection = db.collection("scripts");
    settingsCollection = db.collection("settings");
    geoStatsCollection = db.collection("geo_stats");
    
    // Initialize settings if not exist
    const existingSettings = await settingsCollection.findOne({ _id: "global" });
    if (!existingSettings) {
      await settingsCollection.insertOne({
        _id: "global",
        discordWebhook: process.env.DISCORD_WEBHOOK_URL || "",
        youtubeChannel: process.env.YT_CHANNEL || "",
        updatedAt: new Date()
      });
    }
    
    // Create indexes
    await keysCollection.createIndex({ key: 1 }, { unique: true });
    await keysCollection.createIndex({ fromWorkInkToken: 1 });
    await keysCollection.createIndex({ fromMonetizationToken: 1 });
    await logsCollection.createIndex({ at: -1 });
    await eventsCollection.createIndex({ at: -1 });
    await checkpointsCollection.createIndex({ order: 1 });
    await scriptsCollection.createIndex({ slug: 1 }, { unique: true });
    await scriptsCollection.createIndex({ createdAt: -1 });
    
    // Initialize default checkpoints if none exist
    const count = await checkpointsCollection.countDocuments();
    if (count === 0) {
      await checkpointsCollection.insertMany([
        {
          name: "YouTube Subscribe",
          description: "Subscribe to our YouTube channel",
          type: "youtube",
          url: process.env.YT_CHANNEL || "https://www.youtube.com/@yourchannel",
          waitTime: 10,
          order: 1,
          groupId: null,
          groupMode: null,
          groupName: null,
          enabled: true,
          icon: "youtube",
          createdAt: new Date()
        }
      ]);
    }
    
    // Initialize monetization providers if none exist
    const providerCount = await monetizationProvidersCollection.countDocuments();
    if (providerCount === 0) {
      await monetizationProvidersCollection.insertMany([
        {
          id: "workink",
          name: "Work.ink",
          type: "workink",
          enabled: true,
          isActive: true,
          config: {
            linkUrl: process.env.WORKINK_LINK || "https://workink.net/26ij/6z67dpqo",
            returnUrl: BASE_URL + "/monetization-callback/workink",
            apiEndpoint: "https://work.ink/_api/v2/token/isValid/",
            apiKey: process.env.WORKINK_API_KEY || "",
            useApiKey: false,
            keyDuration: 1 // hours
          },
          stats: {
            totalKeys: 0,
            last30Days: 0
          },
          createdAt: new Date()
        },
          {
          id: "lootlabs",
          name: "Lootlabs",
          type: "lootlabs",
          enabled: true,
          isActive: false,
          config: {
            linkUrl: "https://lootdest.org/s?T3HRbRrx",
            returnUrl: BASE_URL + "/monetization-callback/lootlabs",
            apiKey: "adc3b9b30273bb575eb20a8e1712e9661dde33b08b4c74a2aff12f235ad067ea",
            useApiKey: true,
            numberOfTasks: 3,
            keyDuration: 1
          },
          stats: {
            totalKeys: 0,
            last30Days: 0
          },
          createdAt: new Date()
        },
        {
          id: "linkvertise",
          name: "Linkvertise",
          type: "linkvertise",
          enabled: false,
          isActive: false,
          config: {
            linkUrl: "",
            returnUrl: BASE_URL + "/monetization-callback/linkvertise",
            userId: "",
            apiKey: "",
            useApiKey: false,
            keyDuration: 1
          },
          stats: {
            totalKeys: 0,
            last30Days: 0
          },
          createdAt: new Date()
        }
      ]);
    }
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  }
}

// ===================== PAGE RENDERERS =====================

async function renderOverviewPage(pass, rangeDays, clicks, checkpoints, totalKeys, keysGenerated, keysUsed, scriptExecutions, totalChecks, list) {
  const recentCheckLogs = await logsCollection.find().sort({ at: -1 }).limit(10).toArray();
  
  const rows = list.slice(0, 10).map((item) => {
    const expired = item.expiresAt && item.expiresAt < new Date();
    const expStr = item.expiresAt ? item.expiresAt.toISOString().slice(0, 19).replace("T", " ") : "—";
    const createdStr = item.createdAt ? item.createdAt.toISOString().slice(0, 19).replace("T", " ") : "—";

    return `
    <tr class="border-b border-slate-800/30 hover:bg-slate-800/20 transition-colors">
      <td class="px-4 py-3">
        <div class="font-mono text-sm font-semibold text-blue-300">${item.key}</div>
      </td>
      <td class="px-4 py-3 text-slate-400 text-sm">${createdStr}</td>
      <td class="px-4 py-3 ${expired ? "text-rose-300" : "text-slate-300"} text-sm">${expStr}</td>
      <td class="px-4 py-3">
        ${item.isActive 
          ? '<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">Active</span>' 
          : '<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-500/10 text-slate-300 border border-slate-500/20">Inactive</span>'}
      </td>
      <td class="px-4 py-3 text-slate-300 text-sm font-medium">${item.usageCount || 0}${item.maxUsage ? " / " + item.maxUsage : ""}</td>
      <td class="px-4 py-3 text-slate-400 text-sm">${item.robloxUsername || item.robloxUserId || "—"}</td>
    </tr>
    `;
  }).join("");

  const recentLogs = recentCheckLogs.map((log) => {
    return `
    <tr class="border-b border-slate-800/20 hover:bg-slate-800/10 transition-colors">
      <td class="px-4 py-2.5 text-slate-400 text-xs">${log.at.toISOString().slice(0, 19).replace("T", " ")}</td>
      <td class="px-4 py-2.5 font-mono text-sm text-blue-300">${log.key || "—"}</td>
      <td class="px-4 py-2.5">
        ${log.ok 
          ? '<span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-emerald-500/10 text-emerald-300">OK</span>' 
          : `<span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-rose-500/10 text-rose-300">${log.reason}</span>`}
      </td>
      <td class="px-4 py-2.5 text-slate-400 text-xs">${log.username || "—"}</td>
    </tr>
    `;
  }).join("");

  return `
    <header class="glass border-b border-slate-800/50 px-6 py-5 sticky top-0 z-10">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold mb-1">Dashboard Overview</h1>
          <p class="text-sm text-slate-400">Key statistics for the last ${rangeDays} days</p>
        </div>
        <div class="flex gap-2">
          <a href="/admin?pass=${pass}&page=overview&range=7" class="px-4 py-2 rounded-lg ${rangeDays === 7 ? "bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/30" : "glass text-slate-300 hover:text-white"} text-sm font-medium transition-all">7d</a>
          <a href="/admin?pass=${pass}&page=overview&range=14" class="px-4 py-2 rounded-lg ${rangeDays === 14 ? "bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/30" : "glass text-slate-300 hover:text-white"} text-sm font-medium transition-all">14d</a>
          <a href="/admin?pass=${pass}&page=overview&range=30" class="px-4 py-2 rounded-lg ${rangeDays === 30 ? "bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/30" : "glass text-slate-300 hover:text-white"} text-sm font-medium transition-all">30d</a>
        </div>
      </div>
    </header>

    <div class="p-6 space-y-6">
      <!-- Statistics Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <div class="stat-card">
          <div class="flex items-center justify-between mb-3">
            <div class="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"/>
              </svg>
            </div>
            <span class="text-xs text-slate-500">${rangeDays}d</span>
          </div>
          <p class="text-xs text-slate-400 mb-1 font-medium">Clicks</p>
          <p class="text-3xl font-bold text-blue-300">${clicks}</p>
        </div>

        <div class="stat-card">
          <div class="flex items-center justify-between mb-3">
            <div class="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            </div>
            <span class="text-xs text-slate-500">${rangeDays}d</span>
          </div>
          <p class="text-xs text-slate-400 mb-1 font-medium">Checkpoints</p>
          <p class="text-3xl font-bold text-emerald-300">${checkpoints}</p>
        </div>

        <div class="stat-card">
          <div class="flex items-center justify-between mb-3">
            <div class="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <svg class="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/>
              </svg>
            </div>
            <span class="text-xs text-slate-500">total</span>
          </div>
          <p class="text-xs text-slate-400 mb-1 font-medium">Total Keys</p>
          <p class="text-3xl font-bold text-amber-300">${totalKeys}</p>
        </div>

        <div class="stat-card">
          <div class="flex items-center justify-between mb-3">
            <div class="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <svg class="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
              </svg>
            </div>
            <span class="text-xs text-slate-500">${rangeDays}d</span>
          </div>
          <p class="text-xs text-slate-400 mb-1 font-medium">Generated</p>
          <p class="text-3xl font-bold text-purple-300">${keysGenerated}</p>
        </div>

        <div class="stat-card">
          <div class="flex items-center justify-between mb-3">
            <div class="w-10 h-10 rounded-lg bg-sky-500/10 flex items-center justify-center">
              <svg class="w-5 h-5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
              </svg>
            </div>
            <span class="text-xs text-slate-500">${rangeDays}d</span>
          </div>
          <p class="text-xs text-slate-400 mb-1 font-medium">Keys Used</p>
          <p class="text-3xl font-bold text-sky-300">${keysUsed}</p>
        </div>

        <div class="stat-card">
          <div class="flex items-center justify-between mb-3">
            <div class="w-10 h-10 rounded-lg bg-rose-500/10 flex items-center justify-center">
              <svg class="w-5 h-5 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
              </svg>
            </div>
            <span class="text-xs text-slate-500">${rangeDays}d</span>
          </div>
          <p class="text-xs text-slate-400 mb-1 font-medium">Executions</p>
          <p class="text-3xl font-bold text-rose-300">${scriptExecutions}</p>
        </div>
      </div>

      <!-- Recent Keys -->
      <div class="glass rounded-xl overflow-hidden">
        <div class="px-6 py-4 border-b border-slate-800/50 flex items-center justify-between">
          <div>
            <h2 class="text-lg font-semibold">Recent Keys</h2>
            <p class="text-sm text-slate-400 mt-1">Last 10 created keys</p>
          </div>
          <a href="/admin?pass=${pass}&page=keys" class="text-sm text-blue-400 hover:text-blue-300">View all →</a>
        </div>
        <div class="overflow-x-auto scrollbar">
          <table class="min-w-full">
            <thead class="bg-slate-900/50">
              <tr class="text-xs uppercase text-slate-400 tracking-wider">
                <th class="px-4 py-3 text-left font-semibold">Key</th>
                <th class="px-4 py-3 text-left font-semibold">Created</th>
                <th class="px-4 py-3 text-left font-semibold">Expires</th>
                <th class="px-4 py-3 text-left font-semibold">Status</th>
                <th class="px-4 py-3 text-left font-semibold">Usage</th>
                <th class="px-4 py-3 text-left font-semibold">Roblox</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800/30">
              ${rows || '<tr><td colspan="6" class="px-4 py-8 text-center text-slate-400">No keys yet</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Recent Checks -->
      <div class="glass rounded-xl overflow-hidden">
        <div class="px-6 py-4 border-b border-slate-800/50">
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-lg font-semibold">Recent Checks</h2>
              <p class="text-sm text-slate-400 mt-1">Last 10 verification attempts</p>
            </div>
            <span class="text-xs text-slate-500">${totalChecks} total checks</span>
          </div>
        </div>
        <div class="overflow-x-auto scrollbar">
          <table class="min-w-full">
            <thead class="bg-slate-900/50">
              <tr class="text-xs uppercase text-slate-400 tracking-wider">
                <th class="px-4 py-3 text-left font-semibold">Timestamp</th>
                <th class="px-4 py-3 text-left font-semibold">Key</th>
                <th class="px-4 py-3 text-left font-semibold">Result</th>
                <th class="px-4 py-3 text-left font-semibold">Username</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800/20">
              ${recentLogs || '<tr><td colspan="4" class="px-4 py-8 text-center text-slate-400">No checks yet</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function renderKeysPage(pass, rangeDays, q, filter, list) {
  const rows = list.map((item) => {
    const expired = item.expiresAt && item.expiresAt < new Date();
    const expStr = item.expiresAt ? item.expiresAt.toISOString().slice(0, 19).replace("T", " ") : "—";
    const createdStr = item.createdAt ? item.createdAt.toISOString().slice(0, 19).replace("T", " ") : "—";

    return `
    <tr class="border-b border-slate-800/30 hover:bg-slate-800/20 transition-colors">
      <td class="px-4 py-3">
        <div class="font-mono text-sm font-semibold text-blue-300">${item.key}</div>
      </td>
      <td class="px-4 py-3 text-slate-400 text-sm">${createdStr}</td>
      <td class="px-4 py-3 ${expired ? "text-rose-300" : "text-slate-300"} text-sm">${expStr}</td>
      <td class="px-4 py-3">
        ${item.isActive 
          ? '<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">Active</span>' 
          : '<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-500/10 text-slate-300 border border-slate-500/20">Inactive</span>'}
      </td>
      <td class="px-4 py-3 text-slate-300 text-sm font-medium">${item.usageCount || 0}${item.maxUsage ? " / " + item.maxUsage : ""}</td>
      <td class="px-4 py-3 text-slate-400 text-sm">${item.robloxUsername || item.robloxUserId || "—"}</td>
      <td class="px-4 py-3">
        <span class="inline-flex items-center px-2 py-0.5 rounded-md text-xs ${item.source === 'workink' ? 'bg-purple-500/10 text-purple-300' : 'bg-blue-500/10 text-blue-300'}">${item.source || "—"}</span>
      </td>
      <td class="px-4 py-3">
        <div class="flex gap-1.5">
          <form method="POST" action="/admin/action">
            <input type="hidden" name="pass" value="${pass}">
            <input type="hidden" name="action" value="deactivate">
            <input type="hidden" name="key" value="${item.key}">
            <button class="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded-md text-xs font-medium transition-colors border border-amber-500/20">Off</button>
          </form>
          <form method="POST" action="/admin/action" onsubmit="return confirm('Delete ${item.key}?')">
            <input type="hidden" name="pass" value="${pass}">
            <input type="hidden" name="action" value="delete">
            <input type="hidden" name="key" value="${item.key}">
            <button class="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 rounded-md text-xs font-medium transition-colors border border-rose-500/20">Del</button>
          </form>
          <form method="POST" action="/admin/action">
            <input type="hidden" name="pass" value="${pass}">
            <input type="hidden" name="action" value="extend1h">
            <input type="hidden" name="key" value="${item.key}">
            <button class="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 rounded-md text-xs font-medium transition-colors border border-emerald-500/20">+1h</button>
          </form>
          <form method="POST" action="/admin/action">
            <input type="hidden" name="pass" value="${pass}">
            <input type="hidden" name="action" value="extend24h">
            <input type="hidden" name="key" value="${item.key}">
            <button class="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 rounded-md text-xs font-medium transition-colors border border-emerald-500/20">+24h</button>
          </form>
        </div>
      </td>
    </tr>
    `;
  }).join("");

  return `
    <header class="glass border-b border-slate-800/50 px-6 py-5 sticky top-0 z-10">
      <div>
        <h1 class="text-2xl font-bold mb-1">Key Management</h1>
        <p class="text-sm text-slate-400">Manage all your keys</p>
      </div>
    </header>

    <div class="p-6 space-y-6">
      <!-- Filters and Actions -->
      <div class="glass rounded-xl p-6 space-y-4">
        <h2 class="text-lg font-semibold mb-4">Filters & Actions</h2>
        
        <!-- Search & Filter -->
        <form method="GET" action="/admin" class="flex flex-wrap gap-3">
          <input type="hidden" name="pass" value="${pass}">
          <input type="hidden" name="page" value="keys">
          <input type="hidden" name="range" value="${rangeDays}">
          <div class="flex-1 min-w-[200px]">
            <input name="q" value="${q}" class="w-full glass rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Search keys, roblox, token...">
          </div>
          <select name="filter" class="glass rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="all" ${filter === "all" ? "selected" : ""}>All Keys</option>
            <option value="active" ${filter === "active" ? "selected" : ""}>Active Only</option>
            <option value="expired" ${filter === "expired" ? "selected" : ""}>Expired Only</option>
            <option value="workink" ${filter === "workink" ? "selected" : ""}>Work.ink Source</option>
            <option value="admin" ${filter === "admin" ? "selected" : ""}>Manual Created</option>
          </select>
          <button class="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 px-6 py-2.5 rounded-lg text-sm font-medium shadow-lg shadow-blue-500/30 transition-all">
            Apply Filters
          </button>
        </form>

        <!-- Create Key Form -->
        <form method="POST" action="/admin/create-key" class="glass rounded-xl p-5 border border-slate-700/50">
          <input type="hidden" name="pass" value="${pass}">
          <div class="flex items-center gap-2 mb-4">
            <svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
            </svg>
            <h3 class="font-semibold">Create New Key</h3>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            <input name="customKey" class="glass rounded-lg px-3 py-2 text-sm" placeholder="Custom key (optional)">
            <input name="hours" type="number" value="1" class="glass rounded-lg px-3 py-2 text-sm" placeholder="Hours">
            <input name="maxUsage" type="number" class="glass rounded-lg px-3 py-2 text-sm" placeholder="Max uses">
            <input name="robloxUserId" class="glass rounded-lg px-3 py-2 text-sm" placeholder="Roblox userId">
            <input name="robloxUsername" class="glass rounded-lg px-3 py-2 text-sm" placeholder="Roblox username">
            <input name="hwid" class="glass rounded-lg px-3 py-2 text-sm" placeholder="HWID">
            <button class="bg-gradient-to-r from-emerald-500 to-blue-600 hover:from-emerald-600 hover:to-blue-700 px-4 py-2 rounded-lg text-sm font-medium shadow-lg shadow-emerald-500/30 transition-all">Create Key</button>
          </div>
        </form>

        <!-- Bulk Actions -->
        <div class="flex justify-end">
          <a href="/admin/delete-expired?pass=${pass}" onclick="return confirm('Delete all expired keys?')" class="inline-flex items-center gap-2 bg-rose-500/10 hover:bg-rose-500/20 px-4 py-2 rounded-lg text-sm font-medium text-rose-300 border border-rose-500/20 transition-all">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
            Delete Expired Keys
          </a>
        </div>
      </div>

      <!-- Keys Table -->
      <div class="glass rounded-xl overflow-hidden">
        <div class="px-6 py-4 border-b border-slate-800/50">
          <h2 class="text-lg font-semibold">All Keys</h2>
          <p class="text-sm text-slate-400 mt-1">${list.length} ${list.length === 1 ? 'key' : 'keys'} found</p>
        </div>
        <div class="overflow-x-auto scrollbar">
          <table class="min-w-full">
            <thead class="bg-slate-900/50">
              <tr class="text-xs uppercase text-slate-400 tracking-wider">
                <th class="px-4 py-3 text-left font-semibold">Key</th>
                <th class="px-4 py-3 text-left font-semibold">Created</th>
                <th class="px-4 py-3 text-left font-semibold">Expires</th>
                <th class="px-4 py-3 text-left font-semibold">Status</th>
                <th class="px-4 py-3 text-left font-semibold">Usage</th>
                <th class="px-4 py-3 text-left font-semibold">Roblox</th>
                <th class="px-4 py-3 text-left font-semibold">Source</th>
                <th class="px-4 py-3 text-left font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800/30">
              ${rows || '<tr><td colspan="8" class="px-4 py-8 text-center text-slate-400">No keys found</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

async function renderServicesPage(pass) {
  // Get statistics
  const totalKeys = await keysCollection.countDocuments();
  const workinkKeys = await keysCollection.countDocuments({ source: "workink" });
  const adminKeys = await keysCollection.countDocuments({ source: "admin" });
  const activeKeys = await keysCollection.countDocuments({ 
    isActive: true,
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: { $gt: new Date() } }
    ]
  });
  
  return `
    <header class="glass border-b border-slate-800/50 px-6 py-5 sticky top-0 z-10">
      <div>
        <h1 class="text-2xl font-bold mb-1">Services & Configuration</h1>
        <p class="text-sm text-slate-400">Manage integrations, settings, and API</p>
      </div>
    </header>

    <div class="p-6 space-y-6">
      <!-- Quick Stats -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div class="glass rounded-xl p-4 border border-blue-500/20">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/>
              </svg>
            </div>
            <div>
              <p class="text-xs text-slate-400">Total Keys</p>
              <p class="text-2xl font-bold text-blue-300">${totalKeys}</p>
            </div>
          </div>
        </div>

        <div class="glass rounded-xl p-4 border border-emerald-500/20">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            </div>
            <div>
              <p class="text-xs text-slate-400">Active Keys</p>
              <p class="text-2xl font-bold text-emerald-300">${activeKeys}</p>
            </div>
          </div>
        </div>

        <div class="glass rounded-xl p-4 border border-purple-500/20">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <svg class="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/>
              </svg>
            </div>
            <div>
              <p class="text-xs text-slate-400">Work.ink</p>
              <p class="text-2xl font-bold text-purple-300">${workinkKeys}</p>
            </div>
          </div>
        </div>

        <div class="glass rounded-xl p-4 border border-amber-500/20">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <svg class="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
              </svg>
            </div>
            <div>
              <p class="text-xs text-slate-400">Admin Created</p>
              <p class="text-2xl font-bold text-amber-300">${adminKeys}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Default Key Settings -->
      <div class="glass rounded-xl p-6">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h2 class="text-xl font-bold mb-2">Default Key Settings</h2>
            <p class="text-slate-400 text-sm">Configure default settings for new keys</p>
          </div>
          <button onclick="toggleEdit('key-settings')" class="px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 rounded-lg text-sm font-medium border border-blue-500/20">
            <svg class="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
            </svg>
            Edit
          </button>
        </div>

        <form method="POST" action="/admin/update-key-settings" class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input type="hidden" name="pass" value="${pass}">
          
          <div class="glass rounded-lg p-4 border border-slate-700/50">
            <label class="block text-xs text-slate-400 mb-2 uppercase tracking-wider">Default Key Duration (hours)</label>
            <input type="number" name="defaultDuration" value="1" min="1" max="168" class="w-full bg-slate-950/40 border border-slate-700 rounded-lg px-3 py-2 text-sm" disabled id="key-settings-input-1">
            <p class="text-xs text-slate-500 mt-1">How long keys are valid by default</p>
          </div>

          <div class="glass rounded-lg p-4 border border-slate-700/50">
            <label class="block text-xs text-slate-400 mb-2 uppercase tracking-wider">Auto-cleanup expired keys</label>
            <select name="autoCleanup" class="w-full bg-slate-950/40 border border-slate-700 rounded-lg px-3 py-2 text-sm" disabled id="key-settings-input-2">
              <option value="never">Never</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
            <p class="text-xs text-slate-500 mt-1">Automatically remove expired keys</p>
          </div>

          <div class="col-span-full">
            <button type="submit" class="hidden px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-blue-600 hover:from-emerald-600 hover:to-blue-700 rounded-lg font-medium shadow-lg transition-all" id="key-settings-save">
              Save Changes
            </button>
          </div>
        </form>
      </div>
      <!-- External Services -->
      <div class="glass rounded-xl p-6">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h2 class="text-xl font-bold mb-2">External Services</h2>
            <p class="text-slate-400 text-sm">Manage third-party integrations</p>
          </div>
          <button onclick="toggleEdit('services')" class="px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 rounded-lg text-sm font-medium border border-blue-500/20">
            <svg class="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
            </svg>
            Edit URLs
          </button>
        </div>

        <form method="POST" action="/admin/update-services" class="space-y-4">
          <input type="hidden" name="pass" value="${pass}">

          <!-- Work.ink -->
          <div class="glass rounded-lg p-5 border border-purple-500/20">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/>
            </svg>
          </div>
          <div class="flex-1">
                <h3 class="font-semibold">Work.ink</h3>
                <p class="text-xs text-slate-400">Monetization service</p>
            </div>
              <span class="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">Active</span>
            </div>
            
            <div class="space-y-3">
              <div>
                <label class="block text-xs text-slate-400 mb-2">Work.ink Link</label>
                <div class="flex gap-2">
                  <input type="url" name="workinkLink" value="${WORKINK_LINK}" class="flex-1 bg-slate-950/40 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono" disabled id="services-input-1">
                  <button type="button" onclick="navigator.clipboard.writeText('${WORKINK_LINK}')" class="px-3 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 rounded-lg text-xs border border-blue-500/20">
                    Copy
                  </button>
                </div>
              </div>

              <div>
                <label class="block text-xs text-slate-400 mb-2">Return URL (for Work.ink settings)</label>
                <div class="flex gap-2">
                  <input type="text" value="${BASE_URL}/workink-return" readonly class="flex-1 bg-slate-950/40 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono">
                  <button type="button" onclick="navigator.clipboard.writeText('${BASE_URL}/workink-return')" class="px-3 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 rounded-lg text-xs border border-blue-500/20">
                    Copy
                  </button>
                </div>
              </div>

              <div class="p-3 bg-purple-500/5 border border-purple-500/20 rounded-lg">
                <div class="flex items-start gap-2">
                  <svg class="w-4 h-4 text-purple-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                  <p class="text-xs text-slate-400">Generated: <strong class="text-purple-300">${workinkKeys}</strong> keys from Work.ink</p>
            </div>
          </div>
        </div>
      </div>

          <!-- Backend URL -->
          <div class="glass rounded-lg p-5 border border-blue-500/20">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"/>
            </svg>
          </div>
          <div class="flex-1">
                <h3 class="font-semibold">Backend Server</h3>
                <p class="text-xs text-slate-400">Your API endpoint URL</p>
            </div>
            </div>
            
            <div>
              <label class="block text-xs text-slate-400 mb-2">Server URL</label>
              <input type="url" name="backendUrl" value="${BASE_URL}" class="w-full bg-slate-950/40 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono" disabled id="services-input-2">
              <p class="text-xs text-slate-500 mt-2">Used for callbacks and API endpoints</p>
              </div>
            </div>

          <div class="hidden" id="services-save-btn">
            <button type="submit" class="w-full py-3 bg-gradient-to-r from-emerald-500 to-blue-600 hover:from-emerald-600 hover:to-blue-700 rounded-lg font-medium shadow-lg transition-all">
              Save Service Settings
            </button>
          </div>
        </form>
      </div>

      <!-- API Endpoints with Testing -->
      <div class="glass rounded-xl p-6">
        <div class="flex items-center justify-between mb-6">
          <div>
          <h2 class="text-xl font-bold mb-2">API Endpoints</h2>
            <p class="text-slate-400 text-sm">Test and monitor your API endpoints</p>
          </div>
        </div>

        <div class="space-y-3">
          <div class="p-4 glass rounded-lg border border-slate-700/50 hover:border-emerald-500/30 transition-colors">
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-3 flex-1">
                <span class="px-2 py-0.5 rounded text-xs font-mono bg-emerald-500/10 text-emerald-300">GET</span>
                <code class="text-sm font-mono text-slate-200">/gate</code>
              <p class="text-xs text-slate-400">Get key generation URL</p>
            </div>
              <button onclick="testEndpoint('/gate', 'GET')" class="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 rounded-lg text-xs font-medium border border-blue-500/20">
                Test
              </button>
            </div>
            <div id="result-gate" class="hidden mt-2 p-2 rounded bg-slate-900/50 text-xs font-mono"></div>
          </div>

          <div class="p-4 glass rounded-lg border border-slate-700/50 hover:border-emerald-500/30 transition-colors">
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-3 flex-1">
                <span class="px-2 py-0.5 rounded text-xs font-mono bg-emerald-500/10 text-emerald-300">GET</span>
                <code class="text-sm font-mono text-slate-200">/check</code>
                <p class="text-xs text-slate-400">Verify key validity</p>
              </div>
              <div class="flex gap-2">
                <input id="test-key-input" type="text" placeholder="Enter key..." class="glass rounded px-2 py-1 text-xs w-32">
                <button onclick="testCheckEndpoint()" class="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 rounded-lg text-xs font-medium border border-blue-500/20">
                  Test
                </button>
            </div>
            </div>
            <div id="result-check" class="hidden mt-2 p-2 rounded bg-slate-900/50 text-xs font-mono"></div>
          </div>

          <div class="p-4 glass rounded-lg border border-slate-700/50">
            <div class="flex items-center gap-3">
                <span class="px-2 py-0.5 rounded text-xs font-mono bg-emerald-500/10 text-emerald-300">GET</span>
                <code class="text-sm font-mono text-slate-200">/get-key</code>
              <p class="text-xs text-slate-400">User checkpoint page</p>
              <a href="/get-key" target="_blank" class="ml-auto px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 rounded-lg text-xs font-medium border border-blue-500/20">
                Open
              </a>
              </div>
          </div>

          <div class="p-4 glass rounded-lg border border-slate-700/50">
            <div class="flex items-center gap-3">
              <span class="px-2 py-0.5 rounded text-xs font-mono bg-emerald-500/10 text-emerald-300">GET</span>
              <code class="text-sm font-mono text-slate-200">/workink-return</code>
              <p class="text-xs text-slate-400">Work.ink callback handler</p>
            </div>
          </div>
            </div>
          </div>

      <!-- Export Configuration -->
      <div class="glass rounded-xl p-6">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h2 class="text-xl font-bold mb-2">Configuration Export</h2>
            <p class="text-slate-400 text-sm">Export your configuration for backup or deployment</p>
          </div>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button onclick="exportConfig('env')" class="p-4 glass rounded-lg border border-slate-700/50 hover:border-blue-500/30 transition-all text-left">
            <div class="flex items-center gap-3 mb-2">
              <div class="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
              </div>
              <div>
                <h3 class="font-semibold">.env File</h3>
                <p class="text-xs text-slate-400">Environment variables</p>
              </div>
            </div>
          </button>

          <button onclick="exportConfig('json')" class="p-4 glass rounded-lg border border-slate-700/50 hover:border-emerald-500/30 transition-all text-left">
            <div class="flex items-center gap-3 mb-2">
              <div class="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"/>
                </svg>
              </div>
              <div>
                <h3 class="font-semibold">JSON Config</h3>
                <p class="text-xs text-slate-400">Configuration file</p>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>

    <script>
      function toggleEdit(section) {
        if (section === 'key-settings') {
          document.getElementById('key-settings-input-1').disabled = !document.getElementById('key-settings-input-1').disabled;
          document.getElementById('key-settings-input-2').disabled = !document.getElementById('key-settings-input-2').disabled;
          document.getElementById('key-settings-save').classList.toggle('hidden');
        } else if (section === 'services') {
          document.getElementById('services-input-1').disabled = !document.getElementById('services-input-1').disabled;
          document.getElementById('services-input-2').disabled = !document.getElementById('services-input-2').disabled;
          document.getElementById('services-save-btn').classList.toggle('hidden');
        }
      }

      async function testEndpoint(path, method) {
        const resultDiv = document.getElementById('result-' + path.replace('/', ''));
        resultDiv.classList.remove('hidden');
        resultDiv.className = 'mt-2 p-2 rounded bg-slate-900/50 text-xs font-mono text-slate-400';
        resultDiv.textContent = 'Testing...';
        
        try {
          const response = await fetch(path, { method });
          const data = await response.json();
          resultDiv.className = 'mt-2 p-2 rounded bg-emerald-900/20 border border-emerald-500/30 text-xs font-mono text-emerald-300';
          resultDiv.textContent = '✓ Success: ' + JSON.stringify(data, null, 2);
        } catch (error) {
          resultDiv.className = 'mt-2 p-2 rounded bg-rose-900/20 border border-rose-500/30 text-xs font-mono text-rose-300';
          resultDiv.textContent = '✗ Error: ' + error.message;
        }
      }

      async function testCheckEndpoint() {
        const key = document.getElementById('test-key-input').value;
        if (!key) {
          alert('Please enter a key to test');
          return;
        }

        const resultDiv = document.getElementById('result-check');
        resultDiv.classList.remove('hidden');
        resultDiv.className = 'mt-2 p-2 rounded bg-slate-900/50 text-xs font-mono text-slate-400';
        resultDiv.textContent = 'Testing key: ' + key;
        
        try {
          const response = await fetch('/check?key=' + encodeURIComponent(key));
          const data = await response.json();
          
          if (data.valid) {
            resultDiv.className = 'mt-2 p-2 rounded bg-emerald-900/20 border border-emerald-500/30 text-xs font-mono text-emerald-300';
            resultDiv.textContent = '✓ Valid Key';
          } else {
            resultDiv.className = 'mt-2 p-2 rounded bg-amber-900/20 border border-amber-500/30 text-xs font-mono text-amber-300';
            resultDiv.textContent = '⚠ Invalid: ' + (data.reason || 'Unknown reason');
          }
        } catch (error) {
          resultDiv.className = 'mt-2 p-2 rounded bg-rose-900/20 border border-rose-500/30 text-xs font-mono text-rose-300';
          resultDiv.textContent = '✗ Error: ' + error.message;
        }
      }

      function exportConfig(type) {
        if (type === 'env') {
          const envContent = \`# Key Management System Configuration
PORT=3000
MONGODB_URI=${MONGODB_URI}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
WORKINK_LINK=${WORKINK_LINK}
YT_CHANNEL=${YOUTUBE_CHANNEL}
BASE_URL=${BASE_URL}
DISCORD_WEBHOOK_URL=${DISCORD_WEBHOOK_URL || ''}
\`;
          downloadFile('.env', envContent);
        } else if (type === 'json') {
          const jsonConfig = {
            server: {
              port: 3000,
              backend_url: "${BASE_URL}"
            },
            database: {
              mongodb_uri: "${MONGODB_URI}",
              database_name: "key_management"
            },
            services: {
              workink: {
                link: "${WORKINK_LINK}",
                return_url: "${BASE_URL}/workink-return"
              },
              youtube: {
                channel: "${YOUTUBE_CHANNEL}"
              }
            },
            webhooks: {
              discord: "${DISCORD_WEBHOOK_URL || ''}"
            }
          };
          downloadFile('config.json', JSON.stringify(jsonConfig, null, 2));
        }
      }

      function downloadFile(filename, content) {
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    </script>
    </div>
  `;
}

async function renderMonetizationPage(pass) {
  const providers = await monetizationProvidersCollection.find().toArray();
  const activeProvider = providers.find(p => p.isActive);
  
  const providerIcons = {
    workink: '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/></svg>',
    lootlabs: '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>',
    linkvertise: '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>'
  };
  
  const providerColors = {
    workink: 'from-purple-500 to-pink-600',
    lootlabs: 'from-orange-500 to-red-600',
    linkvertise: 'from-blue-500 to-cyan-600'
  };

  const providerCards = providers.map(provider => `
    <div class="glass rounded-xl p-6 border ${provider.isActive ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-700/50'}">
      <div class="flex items-start gap-4 mb-4">
        <div class="w-14 h-14 rounded-xl bg-gradient-to-br ${providerColors[provider.type] || 'from-slate-500 to-slate-600'} flex items-center justify-center shadow-lg">
          ${providerIcons[provider.type] || providerIcons.workink}
        </div>
            <div class="flex-1">
          <div class="flex items-center gap-3 mb-2">
            <h3 class="text-xl font-bold">${provider.name}</h3>
            ${provider.isActive ? '<span class="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">ACTIVE</span>' : ''}
            ${provider.enabled ? '<span class="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-300 border border-blue-500/20">Enabled</span>' : '<span class="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-500/10 text-slate-300 border border-slate-500/20">Disabled</span>'}
              </div>
          <p class="text-slate-400 text-sm">ID: <code class="text-xs font-mono">${provider.id}</code></p>
        </div>
        <div class="flex gap-2">
          ${!provider.isActive ? `
          <form method="POST" action="/admin/monetization-set-active" style="display:inline;">
            <input type="hidden" name="pass" value="${pass}">
            <input type="hidden" name="providerId" value="${provider.id}">
            <button class="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 rounded-lg text-xs font-medium border border-emerald-500/20">
              Set Active
            </button>
          </form>
          ` : ''}
          <button onclick="editProvider('${provider.id}')" class="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 rounded-lg text-xs font-medium border border-blue-500/20">
            Configure
          </button>
            </div>
          </div>

      <!-- Stats -->
      <div class="grid grid-cols-3 gap-3 mb-4">
        <div class="glass rounded-lg p-3 border border-slate-700/50">
          <p class="text-xs text-slate-400 mb-1">Total Keys</p>
          <p class="text-2xl font-bold text-blue-300">${provider.stats?.totalKeys || 0}</p>
        </div>
        <div class="glass rounded-lg p-3 border border-slate-700/50">
          <p class="text-xs text-slate-400 mb-1">Last 30 Days</p>
          <p class="text-2xl font-bold text-emerald-300">${provider.stats?.last30Days || 0}</p>
        </div>
        <div class="glass rounded-lg p-3 border border-slate-700/50">
          <p class="text-xs text-slate-400 mb-1">Duration</p>
          <p class="text-2xl font-bold text-purple-300">${provider.config?.keyDuration || 1}h</p>
        </div>
      </div>

      <!-- Config Preview -->
      <div class="space-y-2">
        <div class="flex items-center gap-2 text-xs mb-2">
          <span class="text-slate-500">Mode:</span>
          ${provider.config?.useApiKey ? `
          <span class="px-2 py-1 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 flex items-center gap-1">
            🔑 API Key
          </span>
          <span class="text-slate-400 text-[10px]">(Enhanced)</span>
          ` : `
          <span class="px-2 py-1 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20 flex items-center gap-1">
            🔗 Direct Link
          </span>
          <span class="text-slate-400 text-[10px]">(Standard)</span>
          `}
        </div>
        ${provider.config?.linkUrl && !provider.config?.useApiKey ? `
        <div class="flex items-center gap-2 text-xs">
          <span class="text-slate-500">Link URL:</span>
          <code class="flex-1 glass rounded px-2 py-1 text-slate-300 truncate">${provider.config.linkUrl}</code>
          <button onclick="navigator.clipboard.writeText('${provider.config.linkUrl}')" class="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-300">
            Copy
          </button>
        </div>
        ` : ''}
        ${provider.config?.useApiKey ? `
        <div class="flex items-center gap-2 text-xs">
          <span class="text-slate-500">API Key:</span>
          <code class="flex-1 glass rounded px-2 py-1 text-slate-300">••••••••••••</code>
          <span class="px-2 py-1 rounded bg-emerald-500/10 text-emerald-300 text-[10px]">Configured</span>
        </div>
        ` : ''}
        <div class="flex items-center gap-2 text-xs">
          <span class="text-slate-500">Callback URL:</span>
          <code class="flex-1 glass rounded px-2 py-1 text-slate-300 truncate">${provider.config?.returnUrl || ''}</code>
          <button onclick="navigator.clipboard.writeText('${provider.config?.returnUrl || ''}')" class="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-300">
            Copy
          </button>
        </div>
      </div>
    </div>
  `).join('');

  return `
    <header class="glass border-b border-slate-800/50 px-6 py-5 sticky top-0 z-10">
      <div>
        <h1 class="text-2xl font-bold mb-1">Monetization Providers</h1>
        <p class="text-sm text-slate-400">Manage and configure monetization services</p>
      </div>
    </header>

    <div class="p-6 space-y-6">
      <!-- Active Provider Info -->
      ${activeProvider ? `
      <div class="glass rounded-xl p-5 bg-gradient-to-r from-emerald-500/10 to-blue-500/10 border border-emerald-500/30">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-lg bg-emerald-500/20 flex items-center justify-center">
            <svg class="w-6 h-6 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </div>
          <div>
            <h3 class="font-semibold text-emerald-300">Currently Active Provider</h3>
            <p class="text-sm text-slate-300">
              <strong>${activeProvider.name}</strong> is handling key generation • 
              Generated <strong>${activeProvider.stats?.totalKeys || 0}</strong> keys total
            </p>
          </div>
        </div>
      </div>
      ` : `
      <div class="glass rounded-xl p-5 bg-amber-500/5 border border-amber-500/30">
        <div class="flex items-center gap-3">
          <svg class="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
          <div>
            <h3 class="font-semibold text-amber-300">No Active Provider</h3>
            <p class="text-sm text-slate-400">Please set one provider as active to enable key generation</p>
          </div>
        </div>
      </div>
      `}

      <!-- Info Boxes -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class="glass rounded-xl p-5 bg-blue-500/5 border border-blue-500/20">
        <div class="flex items-start gap-3">
          <svg class="w-5 h-5 text-blue-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <div>
            <h3 class="font-semibold text-blue-300 mb-2">Integration Status</h3>
            <ul class="text-sm text-slate-300 space-y-1">
              <li>• <strong class="text-emerald-300">Work.ink:</strong> ✅ Fully tested and working</li>
              <li>• <strong class="text-emerald-300">Lootlabs:</strong> ✅ Fully integrated with API + Anti-Bypass</li>
              <li>• <strong class="text-amber-300">Linkvertise:</strong> ⚠️ Requires API documentation</li>
              <li class="pt-2 text-xs text-slate-400">→ Only ONE provider can be active at a time</li>
            </ul>
          </div>
        </div>
      </div>

        <div class="glass rounded-xl p-5 bg-purple-500/5 border border-purple-500/20">
          <div class="flex items-start gap-3">
            <svg class="w-5 h-5 text-purple-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
            </svg>
            <div>
              <h3 class="font-semibold text-purple-300 mb-2">Work.ink API Key</h3>
              <ul class="text-sm text-slate-300 space-y-1">
                <li>• Get API key from Work.ink dashboard</li>
                <li>• Enable for authenticated requests</li>
                <li>• Enhanced security & rate limits</li>
                <li>• Optional but recommended</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <!-- Providers -->
      <div class="space-y-4">
        ${providerCards}
      </div>
    </div>

    <!-- Edit Provider Modal -->
    <div id="provider-modal" class="hidden fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div class="glass rounded-2xl p-6 max-w-2xl w-full shadow-2xl">
        <div class="flex items-center justify-between mb-6">
          <h2 id="modal-provider-name" class="text-xl font-bold">Configure Provider</h2>
          <button onclick="closeProviderModal()" class="text-slate-400 hover:text-white transition-colors">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form id="provider-form" method="POST" action="/admin/monetization-update" class="space-y-4">
          <input type="hidden" name="pass" value="${pass}">
          <input type="hidden" id="provider-id" name="providerId">
          
          <div id="provider-fields"></div>

          <div class="flex gap-3 pt-4">
            <button type="submit" class="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-blue-600 hover:from-emerald-600 hover:to-blue-700 rounded-lg font-medium shadow-lg transition-all">
              Save Configuration
            </button>
            <button type="button" onclick="closeProviderModal()" class="px-6 py-3 glass hover:bg-slate-700/50 rounded-lg font-medium transition-all">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>

    <script>
      const providers = ${JSON.stringify(providers)};

      function editProvider(providerId) {
        const provider = providers.find(p => p.id === providerId);
        if (!provider) return;

        document.getElementById('modal-provider-name').textContent = 'Configure ' + provider.name;
        document.getElementById('provider-id').value = providerId;

        let fieldsHtml = '';

        if (provider.type === 'workink') {
          fieldsHtml = \`
            <div class="space-y-4">
              <!-- Mode Selector -->
              <div class="p-4 glass rounded-lg border border-purple-500/20 bg-purple-500/5">
                <label class="block text-sm font-medium mb-3 text-purple-300">🔧 Integration Mode</label>
                <div class="grid grid-cols-2 gap-3">
                  <button type="button" onclick="setMode('link')" id="mode-link" class="p-3 rounded-lg border transition-all \${!provider.config?.useApiKey ? 'bg-blue-500/20 border-blue-500/50 text-blue-300' : 'glass border-slate-700/50 text-slate-400'}">
                    <div class="text-center">
                      <div class="text-2xl mb-1">🔗</div>
                      <div class="text-xs font-medium">Direct Link</div>
                      <div class="text-[10px] text-slate-500 mt-1">Public API</div>
                    </div>
                  </button>
                  <button type="button" onclick="setMode('api')" id="mode-api" class="p-3 rounded-lg border transition-all \${provider.config?.useApiKey ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300' : 'glass border-slate-700/50 text-slate-400'}">
                    <div class="text-center">
                      <div class="text-2xl mb-1">🔑</div>
                      <div class="text-xs font-medium">API Key</div>
                      <div class="text-[10px] text-slate-500 mt-1">Enhanced</div>
                    </div>
                  </button>
                </div>
              </div>

              <!-- Link Mode Fields -->
              <div id="link-mode-fields" class="\${provider.config?.useApiKey ? 'hidden' : ''}">
                <div>
                  <label class="block text-sm font-medium mb-2">Work.ink Link URL</label>
                  <input name="linkUrl" value="\${provider.config?.linkUrl || ''}" class="w-full glass rounded-lg px-4 py-2.5 text-sm" placeholder="https://workink.net/...">
                  <p class="text-xs text-slate-400 mt-1">Your Work.ink shortened link</p>
                </div>
              </div>

              <!-- API Mode Fields -->
              <div id="api-mode-fields" class="\${!provider.config?.useApiKey ? 'hidden' : ''}">
                <div>
                  <label class="block text-sm font-medium mb-2">Work.ink API Key</label>
                  <input name="apiKey" type="password" value="\${provider.config?.apiKey || ''}" class="w-full glass rounded-lg px-4 py-2.5 text-sm font-mono" placeholder="Your Work.ink API key">
                  <p class="text-xs text-slate-400 mt-2">
                    ✨ <strong>API Benefits:</strong> Authenticated requests, enhanced security, better rate limits, advanced features
                  </p>
                </div>
              </div>

              <input type="hidden" name="useApiKey" id="useApiKeyHidden" value="\${provider.config?.useApiKey ? 'on' : 'off'}">

              <div>
                <label class="block text-sm font-medium mb-2">Key Duration (hours)</label>
                <input name="keyDuration" type="number" min="1" max="168" value="\${provider.config?.keyDuration || 1}" required class="w-full glass rounded-lg px-4 py-2.5 text-sm">
              </div>
              
              <div class="p-3 glass rounded-lg bg-blue-500/5 border border-blue-500/20">
                <p class="text-xs text-slate-400">
                  <strong>Return URL (set in Work.ink settings):</strong><br>
                  <code class="text-blue-300">${provider.config?.returnUrl || 'Not configured'}</code>
                </p>
              </div>
            </div>
          \`;
        } else if (provider.type === 'lootlabs') {
          fieldsHtml = \`
            <div class="space-y-4">
              <!-- Mode Selector -->
              <div class="p-4 glass rounded-lg border border-orange-500/20 bg-orange-500/5">
                <label class="block text-sm font-medium mb-3 text-orange-300">🔧 Integration Mode</label>
                <div class="grid grid-cols-2 gap-3">
                  <button type="button" onclick="setMode('link')" id="mode-link" class="p-3 rounded-lg border transition-all \${!provider.config?.useApiKey ? 'bg-blue-500/20 border-blue-500/50 text-blue-300' : 'glass border-slate-700/50 text-slate-400'}">
                    <div class="text-center">
                      <div class="text-2xl mb-1">🔗</div>
                      <div class="text-xs font-medium">Direct Link</div>
                    </div>
                  </button>
                  <button type="button" onclick="setMode('api')" id="mode-api" class="p-3 rounded-lg border transition-all \${provider.config?.useApiKey ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300' : 'glass border-slate-700/50 text-slate-400'}">
                    <div class="text-center">
                      <div class="text-2xl mb-1">🔑</div>
                      <div class="text-xs font-medium">API Key</div>
                    </div>
                  </button>
                </div>
              </div>

              <!-- Link Mode Fields -->
              <div id="link-mode-fields" class="\${provider.config?.useApiKey ? 'hidden' : ''}">
                <div>
                  <label class="block text-sm font-medium mb-2">Lootlabs Base Link</label>
                  <input name="linkUrl" value="\${provider.config?.linkUrl || ''}" class="w-full glass rounded-lg px-4 py-2.5 text-sm" placeholder="https://loot-link.com/s?qo0f">
                  <p class="text-xs text-slate-400 mt-1">Create ONE link in Lootlabs panel and paste here</p>
                </div>
              </div>

              <!-- API Mode Fields -->
              <div id="api-mode-fields" class="\${!provider.config?.useApiKey ? 'hidden' : ''}">
                <div>
                  <label class="block text-sm font-medium mb-2">Lootlabs API Key</label>
                  <input name="apiKey" type="password" value="\${provider.config?.apiKey || ''}" class="w-full glass rounded-lg px-4 py-2.5 text-sm font-mono" placeholder="Your Lootlabs API key (64 char hex)">
                  <p class="text-xs text-slate-400 mt-2">
                    ✨ <strong>API Benefits:</strong> Anti-Bypass protection, dynamic redirects, better security
                  </p>
                  <p class="text-xs text-emerald-400 mt-1">
                    ℹ️ Get API key from Lootlabs Creator Panel → API section
                  </p>
                </div>
              </div>

              <input type="hidden" name="useApiKey" id="useApiKeyHidden" value="\${provider.config?.useApiKey ? 'on' : 'off'}">

              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium mb-2">Number of Tasks</label>
                  <input name="numberOfTasks" type="number" min="1" max="5" value="\${provider.config?.numberOfTasks || 3}" required class="w-full glass rounded-lg px-4 py-2.5 text-sm">
                  <p class="text-xs text-slate-400 mt-1">1-5 ads per session</p>
                </div>
                
                <div>
                  <label class="block text-sm font-medium mb-2">Key Duration (hours)</label>
                  <input name="keyDuration" type="number" min="1" max="168" value="\${provider.config?.keyDuration || 1}" required class="w-full glass rounded-lg px-4 py-2.5 text-sm">
                </div>
              </div>
              
              <div class="p-3 glass rounded-lg bg-blue-500/5 border border-blue-500/20">
                <p class="text-xs text-slate-400">
                  <strong>Callback URL (automatically configured):</strong><br>
                  <code class="text-blue-300">\${provider.config?.returnUrl || ''}</code>
                </p>
                <p class="text-xs text-emerald-400 mt-2">
                  ✨ When using API mode, callback URL is set automatically when creating the link!
                </p>
              </div>
            </div>
          \`;
        } else if (provider.type === 'linkvertise') {
          fieldsHtml = \`
            <div class="space-y-4">
              <!-- Mode Selector -->
              <div class="p-4 glass rounded-lg border border-cyan-500/20 bg-cyan-500/5">
                <label class="block text-sm font-medium mb-3 text-cyan-300">🔧 Integration Mode</label>
                <div class="grid grid-cols-2 gap-3">
                  <button type="button" onclick="setMode('link')" id="mode-link" class="p-3 rounded-lg border transition-all \${!provider.config?.useApiKey ? 'bg-blue-500/20 border-blue-500/50 text-blue-300' : 'glass border-slate-700/50 text-slate-400'}">
                    <div class="text-center">
                      <div class="text-2xl mb-1">🔗</div>
                      <div class="text-xs font-medium">Direct Link</div>
                    </div>
                  </button>
                  <button type="button" onclick="setMode('api')" id="mode-api" class="p-3 rounded-lg border transition-all \${provider.config?.useApiKey ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300' : 'glass border-slate-700/50 text-slate-400'}">
                    <div class="text-center">
                      <div class="text-2xl mb-1">🔑</div>
                      <div class="text-xs font-medium">API Key</div>
                    </div>
                  </button>
                </div>
              </div>

              <!-- Link Mode Fields -->
              <div id="link-mode-fields" class="\${provider.config?.useApiKey ? 'hidden' : ''}">
                <div>
                  <label class="block text-sm font-medium mb-2">Linkvertise Link URL</label>
                  <input name="linkUrl" value="\${provider.config?.linkUrl || ''}" class="w-full glass rounded-lg px-4 py-2.5 text-sm" placeholder="https://linkvertise.com/...">
                  <p class="text-xs text-slate-400 mt-1">Your Linkvertise shortened link</p>
                </div>
                <div>
                  <label class="block text-sm font-medium mb-2">User ID (Optional)</label>
                  <input name="userId" value="\${provider.config?.userId || ''}" class="w-full glass rounded-lg px-4 py-2.5 text-sm" placeholder="Your Linkvertise User ID">
                </div>
              </div>

              <!-- API Mode Fields -->
              <div id="api-mode-fields" class="\${!provider.config?.useApiKey ? 'hidden' : ''}">
                <div>
                  <label class="block text-sm font-medium mb-2">Linkvertise API Key</label>
                  <input name="apiKey" type="password" value="\${provider.config?.apiKey || ''}" class="w-full glass rounded-lg px-4 py-2.5 text-sm font-mono" placeholder="Your Linkvertise API key">
                </div>
                <div>
                  <label class="block text-sm font-medium mb-2">User ID</label>
                  <input name="userId" value="\${provider.config?.userId || ''}" class="w-full glass rounded-lg px-4 py-2.5 text-sm" placeholder="Required for API mode">
                  <p class="text-xs text-slate-400 mt-2">
                    ✨ <strong>API Benefits:</strong> Dynamic link creation, better tracking, programmatic access
                  </p>
                </div>
              </div>

              <input type="hidden" name="useApiKey" id="useApiKeyHidden" value="\${provider.config?.useApiKey ? 'on' : 'off'}">

              <div>
                <label class="block text-sm font-medium mb-2">Key Duration (hours)</label>
                <input name="keyDuration" type="number" min="1" max="168" value="\${provider.config?.keyDuration || 1}" required class="w-full glass rounded-lg px-4 py-2.5 text-sm">
              </div>
              
              <div class="p-3 glass rounded-lg bg-blue-500/5 border border-blue-500/20">
                <p class="text-xs text-slate-400">
                  <strong>Callback URL (set in Linkvertise):</strong><br>
                  <code class="text-blue-300">\${provider.config?.returnUrl || ''}</code>
                </p>
              </div>
            </div>
          \`;
        }

        document.getElementById('provider-fields').innerHTML = fieldsHtml;
        document.getElementById('provider-modal').classList.remove('hidden');
      }

      function closeProviderModal() {
        document.getElementById('provider-modal').classList.add('hidden');
      }

      function setMode(mode) {
        const linkBtn = document.getElementById('mode-link');
        const apiBtn = document.getElementById('mode-api');
        const linkFields = document.getElementById('link-mode-fields');
        const apiFields = document.getElementById('api-mode-fields');
        const hiddenInput = document.getElementById('useApiKeyHidden');
        
        if (mode === 'link') {
          // Activate link mode
          linkBtn.className = 'p-3 rounded-lg border transition-all bg-blue-500/20 border-blue-500/50 text-blue-300';
          apiBtn.className = 'p-3 rounded-lg border transition-all glass border-slate-700/50 text-slate-400';
          linkFields.classList.remove('hidden');
          apiFields.classList.add('hidden');
          hiddenInput.value = 'off';
        } else {
          // Activate API mode
          linkBtn.className = 'p-3 rounded-lg border transition-all glass border-slate-700/50 text-slate-400';
          apiBtn.className = 'p-3 rounded-lg border transition-all bg-emerald-500/20 border-emerald-500/50 text-emerald-300';
          linkFields.classList.add('hidden');
          apiFields.classList.remove('hidden');
          hiddenInput.value = 'on';
        }
      }

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeProviderModal();
      });
    </script>
  `;
}

async function renderCheckpointsPage(pass) {
  const checkpoints = await checkpointsCollection.find().sort({ order: 1 }).toArray();
  
  // Group checkpoints
  const groups = {};
  const standalone = [];
  
  checkpoints.forEach(cp => {
    if (cp.groupId) {
      if (!groups[cp.groupId]) {
        groups[cp.groupId] = {
          id: cp.groupId,
          name: cp.groupName || 'Unnamed Group',
          mode: cp.groupMode || 'all',
          checkpoints: []
        };
      }
      groups[cp.groupId].checkpoints.push(cp);
    } else {
      standalone.push(cp);
    }
  });

  const groupRows = Object.values(groups).map(group => `
    <div class="glass rounded-xl p-5 border border-purple-500/30">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center shadow-lg">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
            </svg>
          </div>
          <div>
            <h3 class="text-lg font-semibold">${group.name}</h3>
            <p class="text-sm text-slate-400">
              ${group.mode === 'any' ? '✨ Complete ANY task' : '📋 Complete ALL tasks'} 
              (${group.checkpoints.length} ${group.checkpoints.length === 1 ? 'task' : 'tasks'})
            </p>
          </div>
        </div>
        <div class="flex gap-2">
          <button onclick="addToGroup('${group.id}', '${group.name}', '${group.mode}')" class="px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 rounded-lg text-xs font-medium border border-purple-500/20">
            + Add Task
          </button>
          <form method="POST" action="/admin/checkpoint-delete-group" onsubmit="return confirm('Delete entire group?')" style="display:inline;">
            <input type="hidden" name="pass" value="${pass}">
            <input type="hidden" name="groupId" value="${group.id}">
            <button class="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 rounded-lg text-xs font-medium border border-rose-500/20">
              Delete Group
            </button>
          </form>
        </div>
      </div>
      <div class="space-y-2 pl-14">
        ${group.checkpoints.map(cp => `
          <div class="glass rounded-lg p-3 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <span class="text-2xl">${cp.type === 'youtube' ? '📺' : cp.type === 'discord' ? '💬' : cp.type === 'twitter' ? '🐦' : '🔗'}</span>
              <div>
                <div class="text-sm font-medium">${cp.name}</div>
                <div class="text-xs text-slate-400">${cp.waitTime}s wait</div>
              </div>
            </div>
            <div class="flex gap-1.5">
              <button onclick="editCheckpoint('${cp._id}')" class="px-2 py-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 rounded text-xs">Edit</button>
              <form method="POST" action="/admin/checkpoint-delete" onsubmit="return confirm('Delete task?')" style="display:inline;">
                <input type="hidden" name="pass" value="${pass}">
                <input type="hidden" name="id" value="${cp._id}">
                <button class="px-2 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 rounded text-xs">Del</button>
              </form>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
  
  const checkpointRows = standalone.map((cp) => `
    <div class="checkpoint-item glass rounded-xl p-5 border border-slate-700/50 hover:border-blue-500/30 transition-all cursor-move" draggable="true" data-id="${cp._id}">
      <div class="flex items-start gap-4">
        <!-- Drag Handle -->
        <div class="flex-shrink-0 pt-1">
          <svg class="w-6 h-6 text-slate-500 cursor-grab active:cursor-grabbing" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 16h16"/>
          </svg>
        </div>
        
        <!-- Icon -->
        <div class="flex-shrink-0">
          <div class="w-12 h-12 rounded-xl ${cp.type === 'youtube' ? 'bg-gradient-to-br from-red-500 to-pink-600' : cp.type === 'discord' ? 'bg-gradient-to-br from-indigo-500 to-purple-600' : cp.type === 'twitter' ? 'bg-gradient-to-br from-blue-400 to-blue-600' : 'bg-gradient-to-br from-emerald-500 to-blue-600'} flex items-center justify-center shadow-lg">
            ${cp.type === 'youtube' ? '<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M21.8 8s-.2-1.5-.8-2.2c-.8-.8-1.6-.8-2-.9C15.8 4.7 12 4.7 12 4.7s-3.8 0-7 .2c-.4 0-1.2.1-2 .9C2.3 6.5 2.2 8 2.2 8S2 9.6 2 11.3v1.3C2 14.3 2.2 16 2.2 16s.2 1.5.8 2.2c.8.8 1.6.8 2 .9 1.4.1 7 .2 7 .2s3.8 0 7-.2c.4-.1 1.2-.1 2-.9.6-.7.8-2.2.8-2.2s.2-1.7.2-3.4V11.3C22 9.6 21.8 8 21.8 8zM10 14.7V9.3l5.3 2.7L10 14.7z"/></svg>' : 
              cp.type === 'discord' ? '<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515a.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0a12.64 12.64 0 00-.617-1.25a.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057a19.9 19.9 0 005.993 3.03a.078.078 0 00.084-.028a14.09 14.09 0 001.226-1.994a.076.076 0 00-.041-.106a13.107 13.107 0 01-1.872-.892a.077.077 0 01-.008-.128a10.2 10.2 0 00.372-.292a.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127a12.299 12.299 0 01-1.873.892a.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028a19.839 19.839 0 006.002-3.03a.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z"/></svg>' :
              cp.type === 'twitter' ? '<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>' :
              '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>'}
          </div>
        </div>
        
        <!-- Content -->
        <div class="flex-1">
          <div class="flex items-start justify-between mb-2">
            <div>
              <h3 class="text-base font-semibold text-white">${cp.name}</h3>
              <p class="text-sm text-slate-400 mt-1">${cp.description}</p>
            </div>
            <div class="flex items-center gap-2">
              <span class="px-2.5 py-1 rounded-full text-xs font-medium ${cp.enabled ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : 'bg-slate-500/10 text-slate-300 border border-slate-500/20'}">
                ${cp.enabled ? 'Active' : 'Disabled'}
              </span>
              <span class="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-300 border border-blue-500/20">
                #${cp.order}
              </span>
            </div>
          </div>
          
          <div class="flex items-center gap-4 text-xs text-slate-400 mb-3">
            <span class="flex items-center gap-1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              ${cp.waitTime}s wait
            </span>
            <span class="flex items-center gap-1">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/>
              </svg>
              ${cp.type}
            </span>
          </div>
          
          <div class="glass rounded-lg p-3 mb-3 bg-slate-900/30">
            <code class="text-xs text-slate-300 break-all">${cp.url}</code>
          </div>
          
          <!-- Actions -->
          <div class="flex gap-2">
            <button onclick="editCheckpoint('${cp._id}')" class="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 rounded-lg text-xs font-medium border border-blue-500/20 transition-all">
              <svg class="w-3.5 h-3.5 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
              </svg>
              Edit
            </button>
            <form method="POST" action="/admin/checkpoint-toggle" style="display:inline;">
              <input type="hidden" name="pass" value="${pass}">
              <input type="hidden" name="id" value="${cp._id}">
              <button class="px-3 py-1.5 ${cp.enabled ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/20' : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/20'} rounded-lg text-xs font-medium border transition-all">
                ${cp.enabled ? 'Disable' : 'Enable'}
              </button>
            </form>
            <form method="POST" action="/admin/checkpoint-delete" onsubmit="return confirm('Delete checkpoint: ${cp.name}?')" style="display:inline;">
              <input type="hidden" name="pass" value="${pass}">
              <input type="hidden" name="id" value="${cp._id}">
              <button class="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 rounded-lg text-xs font-medium border border-rose-500/20 transition-all">
                <svg class="w-3.5 h-3.5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                </svg>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  `).join('');

  return `
    <header class="glass border-b border-slate-800/50 px-6 py-5 sticky top-0 z-10">
      <div>
        <h1 class="text-2xl font-bold mb-1">Checkpoints</h1>
        <p class="text-sm text-slate-400">Manage verification steps for users</p>
      </div>
    </header>

    <div class="p-6 space-y-6">
      <!-- Add Checkpoint Button -->
      <div class="flex justify-between items-center">
        <div>
          <h2 class="text-lg font-semibold">Active Checkpoints</h2>
          <p class="text-sm text-slate-400 mt-1">Drag to reorder, click to edit</p>
        </div>
        <div class="flex gap-2">
          <button onclick="showCreateCheckpoint()" class="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-blue-600 hover:from-emerald-600 hover:to-blue-700 rounded-lg font-medium shadow-lg shadow-emerald-500/30 transition-all">
            <svg class="w-5 h-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
            </svg>
            Add Single
          </button>
          <button onclick="showCreateGroup()" class="px-5 py-2.5 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 rounded-lg font-medium shadow-lg shadow-purple-500/30 transition-all">
            <svg class="w-5 h-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
            </svg>
            Add Group
          </button>
        </div>
      </div>

      <!-- Checkpoints List -->
      <div id="checkpoints-container" class="space-y-4">
        ${groupRows}
        ${checkpointRows || '<div class="text-center py-12 text-slate-400">No checkpoints yet. Create your first one!</div>'}
      </div>

      <!-- Info Box -->
      <div class="glass rounded-xl p-6 bg-blue-500/5 border border-blue-500/20">
        <div class="flex items-start gap-3">
          <svg class="w-6 h-6 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <div>
            <h3 class="font-semibold text-blue-300 mb-2">How Checkpoints Work</h3>
            <ul class="text-sm text-slate-300 space-y-1">
              <li>• Users must complete checkpoints in order before reaching Work.ink</li>
              <li>• Drag and drop to change the order of checkpoints</li>
              <li>• Disable checkpoints to skip them temporarily</li>
              <li>• YouTube, Discord, Twitter, and custom link types supported</li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <!-- Create/Edit Modal -->
    <div id="checkpoint-modal" class="hidden fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div class="glass rounded-2xl p-6 max-w-2xl w-full shadow-2xl">
        <div class="flex items-center justify-between mb-6">
          <h2 id="modal-title" class="text-xl font-bold">Create Checkpoint</h2>
          <button onclick="closeModal()" class="text-slate-400 hover:text-white transition-colors">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form id="checkpoint-form" method="POST" action="/admin/checkpoint-create" class="space-y-4">
          <input type="hidden" name="pass" value="${pass}">
          <input type="hidden" id="checkpoint-id" name="id" value="">
          
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium mb-2">Checkpoint Name</label>
              <input id="cp-name" name="name" required class="w-full glass rounded-lg px-4 py-2.5 text-sm" placeholder="e.g., Subscribe to YouTube">
            </div>
            
            <div>
              <label class="block text-sm font-medium mb-2">Type</label>
              <select id="cp-type" name="type" required class="w-full glass rounded-lg px-4 py-2.5 text-sm">
                <option value="youtube">YouTube</option>
                <option value="discord">Discord</option>
                <option value="twitter">Twitter / X</option>
                <option value="custom">Custom Link</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium mb-2">Description</label>
            <input id="cp-description" name="description" required class="w-full glass rounded-lg px-4 py-2.5 text-sm" placeholder="What should users do?">
          </div>

          <div>
            <label class="block text-sm font-medium mb-2">URL</label>
            <input id="cp-url" name="url" type="url" required class="w-full glass rounded-lg px-4 py-2.5 text-sm font-mono" placeholder="https://...">
          </div>

          <div>
            <label class="block text-sm font-medium mb-2">Wait Time (seconds)</label>
            <input id="cp-wait" name="waitTime" type="number" min="1" max="60" value="10" required class="w-full glass rounded-lg px-4 py-2.5 text-sm">
            <p class="text-xs text-slate-400 mt-1">How long users must stay before continuing</p>
          </div>

          <div id="group-fields" class="hidden space-y-4 p-4 glass rounded-lg border border-purple-500/20">
            <h3 class="text-sm font-semibold text-purple-300">Group Settings</h3>
            <input id="cp-groupId" name="groupId" type="hidden">
            <div>
              <label class="block text-sm font-medium mb-2">Group Name</label>
              <input id="cp-groupName" name="groupName" class="w-full glass rounded-lg px-4 py-2.5 text-sm" placeholder="e.g., Social Media Tasks">
            </div>
            <div>
              <label class="block text-sm font-medium mb-2">Mode</label>
              <select id="cp-groupMode" name="groupMode" class="w-full glass rounded-lg px-4 py-2.5 text-sm">
                <option value="all">ALL tasks required (AND)</option>
                <option value="any">ANY task required (OR)</option>
              </select>
            </div>
          </div>

          <div class="flex items-center gap-3 p-4 glass rounded-lg">
            <input id="cp-enabled" name="enabled" type="checkbox" checked class="w-5 h-5 rounded border-slate-600">
            <label for="cp-enabled" class="text-sm font-medium">Enable this checkpoint immediately</label>
          </div>

          <div class="flex gap-3 pt-4">
            <button type="submit" class="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-blue-600 hover:from-emerald-600 hover:to-blue-700 rounded-lg font-medium shadow-lg transition-all">
              Save Checkpoint
            </button>
            <button type="button" onclick="closeModal()" class="px-6 py-3 glass hover:bg-slate-700/50 rounded-lg font-medium transition-all">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>

    <script>
      let checkpointsOrder = ${JSON.stringify(checkpoints.map(c => c._id.toString()))};
      
      function showCreateCheckpoint() {
        document.getElementById('modal-title').textContent = 'Create Single Checkpoint';
        document.getElementById('checkpoint-form').action = '/admin/checkpoint-create';
        document.getElementById('checkpoint-id').value = '';
        document.getElementById('cp-name').value = '';
        document.getElementById('cp-type').value = 'youtube';
        document.getElementById('cp-description').value = '';
        document.getElementById('cp-url').value = '';
        document.getElementById('cp-wait').value = '10';
        document.getElementById('cp-enabled').checked = true;
        document.getElementById('cp-groupId').value = '';
        document.getElementById('group-fields').classList.add('hidden');
        document.getElementById('checkpoint-modal').classList.remove('hidden');
      }

      function showCreateGroup() {
        const groupId = 'group_' + Date.now();
        document.getElementById('modal-title').textContent = 'Create Group Checkpoint';
        document.getElementById('checkpoint-form').action = '/admin/checkpoint-create';
        document.getElementById('checkpoint-id').value = '';
        document.getElementById('cp-name').value = '';
        document.getElementById('cp-type').value = 'youtube';
        document.getElementById('cp-description').value = '';
        document.getElementById('cp-url').value = '';
        document.getElementById('cp-wait').value = '10';
        document.getElementById('cp-enabled').checked = true;
        document.getElementById('cp-groupId').value = groupId;
        document.getElementById('cp-groupName').value = '';
        document.getElementById('cp-groupMode').value = 'all';
        document.getElementById('group-fields').classList.remove('hidden');
        document.getElementById('checkpoint-modal').classList.remove('hidden');
      }

      function addToGroup(groupId, groupName, groupMode) {
        document.getElementById('modal-title').textContent = 'Add Task to: ' + groupName;
        document.getElementById('checkpoint-form').action = '/admin/checkpoint-create';
        document.getElementById('checkpoint-id').value = '';
        document.getElementById('cp-name').value = '';
        document.getElementById('cp-type').value = 'youtube';
        document.getElementById('cp-description').value = '';
        document.getElementById('cp-url').value = '';
        document.getElementById('cp-wait').value = '10';
        document.getElementById('cp-enabled').checked = true;
        document.getElementById('cp-groupId').value = groupId;
        document.getElementById('cp-groupName').value = groupName;
        document.getElementById('cp-groupMode').value = groupMode;
        document.getElementById('group-fields').classList.remove('hidden');
        // Make group fields readonly
        document.getElementById('cp-groupName').readOnly = true;
        document.getElementById('cp-groupMode').disabled = true;
        document.getElementById('checkpoint-modal').classList.remove('hidden');
      }

      function editCheckpoint(id) {
        const checkpoint = ${JSON.stringify(checkpoints)}.find(c => c._id === id);
        if (!checkpoint) return;
        
        document.getElementById('modal-title').textContent = 'Edit Checkpoint';
        document.getElementById('checkpoint-form').action = '/admin/checkpoint-update';
        document.getElementById('checkpoint-id').value = id;
        document.getElementById('cp-name').value = checkpoint.name;
        document.getElementById('cp-type').value = checkpoint.type;
        document.getElementById('cp-description').value = checkpoint.description;
        document.getElementById('cp-url').value = checkpoint.url;
        document.getElementById('cp-wait').value = checkpoint.waitTime;
        document.getElementById('cp-enabled').checked = checkpoint.enabled;
        document.getElementById('checkpoint-modal').classList.remove('hidden');
      }

      function closeModal() {
        document.getElementById('checkpoint-modal').classList.add('hidden');
      }

      // Drag and Drop
      const container = document.getElementById('checkpoints-container');
      let draggedElement = null;

      container.addEventListener('dragstart', (e) => {
        if (e.target.classList.contains('checkpoint-item')) {
          draggedElement = e.target;
          e.target.style.opacity = '0.5';
        }
      });

      container.addEventListener('dragend', (e) => {
        if (e.target.classList.contains('checkpoint-item')) {
          e.target.style.opacity = '1';
        }
      });

      container.addEventListener('dragover', (e) => {
        e.preventDefault();
        const afterElement = getDragAfterElement(container, e.clientY);
        if (afterElement == null) {
          container.appendChild(draggedElement);
        } else {
          container.insertBefore(draggedElement, afterElement);
        }
      });

      container.addEventListener('drop', async (e) => {
        e.preventDefault();
        const items = [...container.querySelectorAll('.checkpoint-item')];
        const newOrder = items.map(item => item.dataset.id);
        
        // Save new order
        await fetch('/admin/checkpoint-reorder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pass: '${pass}', order: newOrder })
        });
        
        location.reload();
      });

      function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.checkpoint-item:not(.dragging)')];
        return draggableElements.reduce((closest, child) => {
          const box = child.getBoundingClientRect();
          const offset = y - box.top - box.height / 2;
          if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
          } else {
            return closest;
          }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
      }

      // Close modal on ESC
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
      });
    </script>
  `;
}

async function renderScriptsPage(pass, searchQuery = "") {
  const query = searchQuery ? {
    $or: [
      { name: { $regex: searchQuery, $options: 'i' } },
      { slug: { $regex: searchQuery, $options: 'i' } },
      { description: { $regex: searchQuery, $options: 'i' } }
    ]
  } : {};
  
  const scripts = await scriptsCollection.find(query).sort({ createdAt: -1 }).toArray();
  const baseUrl = BASE_URL; // Use configured backend URL

  return `
    <header class="glass border-b border-slate-800/50 px-6 py-5 sticky top-0 z-10">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold mb-1">📜 Scripts Manager</h1>
          <p class="text-sm text-slate-400">Upload, manage and deliver Lua scripts for Roblox</p>
        </div>
        <button onclick="openAddScriptModal()" class="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 rounded-lg font-medium transition-all shadow-lg shadow-blue-500/30 flex items-center gap-2">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
          </svg>
          New Script
        </button>
      </div>
    </header>

    <div class="p-6 space-y-6">
      <!-- Search Bar -->
      <div class="glass rounded-xl p-4">
        <div class="flex gap-3">
          <div class="flex-1 relative">
            <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input 
              type="text" 
              value="${searchQuery}" 
              onchange="window.location.href='/admin?pass=${pass}&page=scripts&q=' + this.value"
              placeholder="Search scripts by name, slug or description..." 
              class="w-full pl-10 pr-4 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <button onclick="window.location.reload()" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Scripts Grid -->
      ${scripts.length === 0 ? `
        <div class="glass rounded-xl p-12 text-center">
          <div class="w-20 h-20 mx-auto mb-4 rounded-full bg-slate-800 flex items-center justify-center">
            <svg class="w-10 h-10 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/>
            </svg>
          </div>
          <h3 class="text-xl font-semibold mb-2 text-slate-300">No scripts yet</h3>
          <p class="text-slate-500 mb-4">Create your first script to get started</p>
          <button onclick="openAddScriptModal()" class="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 rounded-lg font-medium transition-all">
            Create First Script
          </button>
        </div>
      ` : `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          ${scripts.map(script => {
            const loadstringUrl = baseUrl + '/script/' + script.slug;
            const currentVersion = script.versions[script.versions.length - 1];
            const downloads = script.analytics?.totalDownloads || 0;
            const lastAccessed = script.analytics?.lastAccessed ? new Date(script.analytics.lastAccessed).toLocaleString() : 'Never';
            
            return `
              <div class="glass rounded-xl p-5 hover:border-blue-500/30 transition-all group">
                <div class="flex items-start justify-between mb-3">
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-1">
                      <h3 class="text-lg font-bold text-white">${script.name}</h3>
                      <span class="px-2 py-0.5 text-xs rounded-full ${script.enabled ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-slate-500/20 text-slate-400 border border-slate-500/30'}">
                        ${script.enabled ? '✓ Active' : '○ Disabled'}
                      </span>
                      ${script.obfuscated ? `
                        <span class="px-2 py-0.5 text-xs rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          🔒 Obfuscated
                        </span>
                      ` : ''}
              </div>
                    <p class="text-sm text-slate-400">${script.description || 'No description'}</p>
            </div>
                  <div class="flex gap-2">
                    <button onclick="editScript('${script._id}')" class="p-2 hover:bg-blue-500/10 rounded-lg transition-colors" title="Edit">
                      <svg class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                      </svg>
                    </button>
                    <button onclick="deleteScript('${script._id}', '${script.name}')" class="p-2 hover:bg-red-500/10 rounded-lg transition-colors" title="Delete">
                      <svg class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                      </svg>
                    </button>
          </div>
        </div>

                <!-- Stats -->
                <div class="grid grid-cols-3 gap-3 mb-4">
                  <div class="bg-slate-900/50 rounded-lg p-3">
                    <div class="text-xs text-slate-500 mb-1">Downloads</div>
                    <div class="text-lg font-bold text-emerald-400">${downloads}</div>
                  </div>
                  <div class="bg-slate-900/50 rounded-lg p-3">
                    <div class="text-xs text-slate-500 mb-1">Version</div>
                    <div class="text-lg font-bold text-blue-400">v${currentVersion.version}</div>
                  </div>
                  <div class="bg-slate-900/50 rounded-lg p-3">
                    <div class="text-xs text-slate-500 mb-1">Size</div>
                    <div class="text-lg font-bold text-purple-400">${(currentVersion.content.length / 1024).toFixed(1)}KB</div>
                  </div>
                </div>

                <!-- Loadstring URL -->
                <div class="bg-slate-900/70 rounded-lg p-3 mb-3">
                  <div class="flex items-center gap-2 mb-2">
                    <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
                    </svg>
                    <span class="text-xs font-medium text-slate-400">Loadstring URL</span>
                  </div>
                  <div class="flex gap-2">
                    <input 
                      type="text" 
                      readonly 
                      value="${loadstringUrl}" 
                      class="flex-1 px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-slate-300 font-mono"
                      id="url-${script._id}"
                    />
                    <button 
                      onclick="copyToClipboard('url-${script._id}', this)"
                      class="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors text-sm font-medium"
                    >
                      Copy
                    </button>
                  </div>
                </div>

                <!-- Roblox Code -->
                <div class="bg-gradient-to-r from-slate-900/70 to-slate-800/70 rounded-lg p-3 border border-slate-700/50">
                  <div class="flex items-center gap-2 mb-2">
                    <svg class="w-4 h-4 text-red-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M10.41 0L0 23.041 12.59 24 23 .959 10.41 0zm.503 14.354l-1.887 6.892-1.125-8.859 3.012 1.967z"/>
                    </svg>
                    <span class="text-xs font-medium text-slate-400">Roblox Code</span>
                  </div>
                  <div class="flex gap-2">
                    <input 
                      type="text" 
                      readonly 
                      value='loadstring(game:HttpGet("${loadstringUrl}"))()' 
                      class="flex-1 px-3 py-2 bg-slate-950 border border-slate-700 rounded text-sm text-slate-300 font-mono"
                      id="code-${script._id}"
                    />
                    <button 
                      onclick="copyToClipboard('code-${script._id}', this)"
                      class="px-3 py-2 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 rounded transition-colors text-sm font-medium"
                    >
                      Copy
                    </button>
                  </div>
                </div>

                <!-- Footer Info -->
                <div class="mt-3 pt-3 border-t border-slate-700/50 flex items-center justify-between text-xs text-slate-500">
                  <div>Slug: <span class="text-slate-400 font-mono">${script.slug}</span></div>
                  <div>Last: ${lastAccessed}</div>
      </div>
    </div>
            `;
          }).join('')}
        </div>
      `}
    </div>

    <!-- Add/Edit Script Modal -->
    <div id="scriptModal" class="hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div class="glass rounded-2xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto scrollbar">
        <div class="flex items-center justify-between mb-6">
          <h2 id="modalTitle" class="text-2xl font-bold">Add New Script</h2>
          <button onclick="closeScriptModal()" class="p-2 hover:bg-slate-700 rounded-lg transition-colors">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form id="scriptForm" class="space-y-4">
          <input type="hidden" id="scriptId" name="scriptId">
          
          <div>
            <label class="block text-sm font-medium mb-2">Script Name *</label>
            <input 
              type="text" 
              id="scriptName" 
              name="name" 
              required
              placeholder="My Awesome Script"
              class="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label class="block text-sm font-medium mb-2">Slug (URL identifier) *</label>
            <div class="flex gap-2">
              <input 
                type="text" 
                id="scriptSlug" 
                name="slug" 
                required
                placeholder="my-awesome-script"
                pattern="[a-z0-9-]+"
                class="flex-1 px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button type="button" onclick="generateSlug()" class="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors">
                Generate
              </button>
            </div>
            <p class="text-xs text-slate-500 mt-1">Only lowercase letters, numbers and hyphens</p>
          </div>

          <div>
            <label class="block text-sm font-medium mb-2">Description</label>
            <textarea 
              id="scriptDescription" 
              name="description" 
              rows="2"
              placeholder="A brief description of what this script does..."
              class="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            ></textarea>
          </div>

          <div>
            <label class="block text-sm font-medium mb-2">Lua Code *</label>
            <div class="relative">
              <!-- Hidden textarea for form submission -->
              <textarea 
                id="scriptContent" 
                name="content" 
                required
                style="display:none;"
              ></textarea>
              
              <!-- CodeMirror Editor -->
              <div id="codeEditor" class="border border-slate-700 rounded-lg overflow-hidden" style="height: 400px;"></div>
              
              <div class="mt-2 text-xs text-slate-500" id="codeSize">0 characters</div>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div class="flex items-center gap-3 p-4 bg-slate-900/50 rounded-lg border border-slate-700">
              <input 
                type="checkbox" 
                id="scriptEnabled" 
                name="enabled" 
                checked
                class="w-5 h-5 rounded bg-slate-800 border-slate-600 text-blue-600 focus:ring-2 focus:ring-blue-500"
              />
              <div>
                <label for="scriptEnabled" class="block font-medium cursor-pointer">Enable Script</label>
                <p class="text-xs text-slate-500">Script can be accessed via URL</p>
              </div>
            </div>

            <div class="flex items-center gap-3 p-4 bg-slate-900/50 rounded-lg border border-slate-700">
              <input 
                type="checkbox" 
                id="scriptObfuscated" 
                name="obfuscated"
                class="w-5 h-5 rounded bg-slate-800 border-slate-600 text-purple-600 focus:ring-2 focus:ring-purple-500"
              />
              <div>
                <label for="scriptObfuscated" class="block font-medium cursor-pointer">🔒 Obfuscate Code</label>
                <p class="text-xs text-slate-500">Protect your code (basic)</p>
              </div>
            </div>
          </div>

          <div class="flex items-center gap-3 p-4 bg-gradient-to-r from-blue-500/10 to-emerald-500/10 rounded-lg border border-blue-500/30">
            <input 
              type="checkbox" 
              id="scriptRequireKey" 
              name="requireKey"
              class="w-5 h-5 rounded bg-slate-800 border-slate-600 text-emerald-600 focus:ring-2 focus:ring-emerald-500"
            />
            <div>
              <label for="scriptRequireKey" class="block font-medium cursor-pointer">🔑 Require Key System</label>
              <p class="text-xs text-slate-500">Automatically add key validation (hidden from user)</p>
            </div>
          </div>

          <div class="flex gap-3 pt-4">
            <button 
              type="submit"
              class="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 rounded-lg font-medium transition-all"
            >
              Save Script
            </button>
            <button 
              type="button"
              onclick="closeScriptModal()"
              class="px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>

    <script>
      // Initialize CodeMirror editor
      let editor = null;
      
      function initCodeMirror() {
        if (editor) return; // Already initialized
        
        // Check if CodeMirror is loaded
        if (typeof CodeMirror === 'undefined') {
          console.error('❌ CodeMirror not loaded! Check your internet connection.');
          alert('CodeMirror library failed to load. Please refresh the page or check your internet connection.');
          return;
        }
        
        const editorElement = document.getElementById('codeEditor');
        if (!editorElement) {
          console.error('❌ Editor element not found!');
          return;
        }
        
        try {
          editor = CodeMirror(editorElement, {
          mode: 'lua',
          theme: 'dracula',
          lineNumbers: true,
          lineWrapping: true,
          indentUnit: 2,
          tabSize: 2,
          indentWithTabs: false,
          autoCloseBrackets: true,
          matchBrackets: true,
          styleActiveLine: true,
          placeholder: '-- Your Lua code here\\nprint("Hello from Roblox!")',
          extraKeys: {
            "Tab": function(cm) {
              cm.replaceSelection("  ", "end");
            }
          }
        });
        
          // Update hidden textarea and character count
          editor.on('change', function() {
            const content = editor.getValue();
            document.getElementById('scriptContent').value = content;
            document.getElementById('codeSize').textContent = content.length + ' characters';
          });
          
          // Initial size update
          document.getElementById('codeSize').textContent = '0 characters';
          console.log('✓ CodeMirror initialized successfully!');
          
        } catch (error) {
          console.error('❌ Failed to initialize CodeMirror:', error);
          alert('Failed to initialize code editor: ' + error.message);
        }
      }

      // Generate slug from name
      function generateSlug() {
        const name = document.getElementById('scriptName').value;
        const slug = name.toLowerCase()
          .replace(/[^a-z0-9\\s-]/g, '')
          .replace(/\\s+/g, '-')
          .replace(/-+/g, '-')
          .trim();
        document.getElementById('scriptSlug').value = slug;
      }

      // Auto-generate slug when name changes
      document.getElementById('scriptName').addEventListener('input', function() {
        if (!document.getElementById('scriptId').value) {
          generateSlug();
        }
      });

      // Copy to clipboard
      function copyToClipboard(inputId, button) {
        const input = document.getElementById(inputId);
        input.select();
        document.execCommand('copy');
        
        const originalText = button.textContent;
        button.textContent = '✓ Copied!';
        button.classList.add('bg-emerald-600');
        
        setTimeout(() => {
          button.textContent = originalText;
          button.classList.remove('bg-emerald-600');
        }, 2000);
      }

      // Open add script modal
      function openAddScriptModal() {
        document.getElementById('modalTitle').textContent = 'Add New Script';
        document.getElementById('scriptForm').reset();
        document.getElementById('scriptId').value = '';
        document.getElementById('scriptEnabled').checked = true;
        document.getElementById('scriptModal').classList.remove('hidden');
        
        // Initialize CodeMirror if not already done
        setTimeout(() => {
          initCodeMirror();
          if (editor) {
            editor.setValue('-- Your Lua code here\\nprint("Hello from Roblox!")');
            editor.refresh();
          }
        }, 100);
      }

      // Close modal
      function closeScriptModal() {
        document.getElementById('scriptModal').classList.add('hidden');
      }

      // Edit script
      async function editScript(id) {
        const response = await fetch(\`/admin/scripts/get?id=\${id}&pass=${pass}\`);
        const script = await response.json();
        
        console.log('📝 Editing script:', script.name);
        console.log('Versions:', script.versions.length);
        
        const latestVersion = script.versions[script.versions.length - 1];
        // Use rawContent (original code) instead of obfuscated content
        const originalCode = latestVersion.rawContent || latestVersion.content;
        
        console.log('Has rawContent:', !!latestVersion.rawContent);
        console.log('Code length:', originalCode.length);
        console.log('Code preview:', originalCode.substring(0, 100));
        
        document.getElementById('modalTitle').textContent = 'Edit Script';
        document.getElementById('scriptId').value = script._id;
        document.getElementById('scriptName').value = script.name;
        document.getElementById('scriptSlug').value = script.slug;
        document.getElementById('scriptDescription').value = script.description || '';
        document.getElementById('scriptEnabled').checked = script.enabled;
        document.getElementById('scriptObfuscated').checked = script.obfuscated;
        document.getElementById('scriptRequireKey').checked = script.requireKey || false;
        
        document.getElementById('scriptModal').classList.remove('hidden');
        
        // Initialize CodeMirror and set content
        setTimeout(() => {
          console.log('Initializing CodeMirror...');
          initCodeMirror();
          if (editor) {
            console.log('✓ Editor initialized');
            editor.setValue(originalCode);
            editor.refresh();
            document.getElementById('codeSize').textContent = originalCode.length + ' characters';
            console.log('✓ Code set in editor');
          } else {
            console.error('✗ Editor not initialized!');
          }
        }, 200);
      }

      // Delete script
      async function deleteScript(id, name) {
        if (!confirm(\`Are you sure you want to delete "\${name}"? This action cannot be undone.\`)) {
          return;
        }
        
        const response = await fetch('/admin/scripts/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, pass: '${pass}' })
        });
        
        if (response.ok) {
          location.reload();
        } else {
          alert('Failed to delete script');
        }
      }

      // Submit form
      document.getElementById('scriptForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const data = {
          pass: '${pass}',
          id: formData.get('scriptId') || undefined,
          name: formData.get('name'),
          slug: formData.get('slug'),
          description: formData.get('description'),
          content: formData.get('content'),
          enabled: document.getElementById('scriptEnabled').checked,
          obfuscated: document.getElementById('scriptObfuscated').checked,
          requireKey: document.getElementById('scriptRequireKey').checked  // NEW: Key System
        };
        
        const url = data.id ? '/admin/scripts/edit' : '/admin/scripts/add';
        
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        
        if (response.ok) {
          location.reload();
        } else {
          const error = await response.text();
          alert('Error: ' + error);
        }
      });

      // Close modal on ESC
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeScriptModal();
      });
    </script>
  `;
}

function renderWebhooksPage(pass) {
  return `
    <header class="glass border-b border-slate-800/50 px-6 py-5 sticky top-0 z-10">
      <div>
        <h1 class="text-2xl font-bold mb-1">Webhooks</h1>
        <p class="text-sm text-slate-400">Manage Discord notifications</p>
      </div>
    </header>

    <div class="p-6 space-y-6">
      <!-- Discord Webhook -->
      <div class="glass rounded-xl p-6">
        <div class="flex items-start gap-4 mb-6">
          <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515a.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0a12.64 12.64 0 00-.617-1.25a.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057a19.9 19.9 0 005.993 3.03a.078.078 0 00.084-.028a14.09 14.09 0 001.226-1.994a.076.076 0 00-.041-.106a13.107 13.107 0 01-1.872-.892a.077.077 0 01-.008-.128a10.2 10.2 0 00.372-.292a.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127a12.299 12.299 0 01-1.873.892a.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028a19.839 19.839 0 006.002-3.03a.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
          </div>
          <div class="flex-1">
            <div class="flex items-center gap-3 mb-2">
              <h2 class="text-xl font-bold">Discord Webhook</h2>
              <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${DISCORD_WEBHOOK_URL ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : 'bg-slate-500/10 text-slate-300 border border-slate-500/20'}">${DISCORD_WEBHOOK_URL ? 'Active' : 'Not configured'}</span>
            </div>
            <p class="text-slate-400 text-sm mb-4">Receive notifications for key events</p>
            
            ${DISCORD_WEBHOOK_URL ? `
            <div class="glass rounded-lg p-4 border border-slate-700/50 mb-4">
              <label class="block text-xs text-slate-400 mb-2 uppercase tracking-wider">Webhook URL</label>
              <div class="flex gap-2">
                <input type="text" value="${DISCORD_WEBHOOK_URL.slice(0, 50)}..." readonly class="flex-1 bg-slate-950/40 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono">
                <button onclick="navigator.clipboard.writeText('${DISCORD_WEBHOOK_URL}')" class="px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 rounded-lg text-sm font-medium border border-blue-500/20">Copy</button>
              </div>
            </div>
            ` : ''}

            <div class="space-y-2">
              <h3 class="font-semibold text-sm mb-3">Tracked Events:</h3>
              <div class="flex items-center gap-3 p-3 glass rounded-lg">
                <div class="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
                  </svg>
                </div>
                <div>
                  <p class="text-sm font-medium">Key Created (Work.ink)</p>
                  <p class="text-xs text-slate-400">When user completes Work.ink verification</p>
                </div>
              </div>

              <div class="flex items-center gap-3 p-3 glass rounded-lg">
                <div class="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <svg class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
                  </svg>
                </div>
                <div>
                  <p class="text-sm font-medium">Key Created (Admin)</p>
                  <p class="text-xs text-slate-400">When admin manually creates a key</p>
                </div>
              </div>
            </div>

            <div class="mt-4 p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
              <div class="flex items-start gap-3">
                <svg class="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <div>
                  <p class="text-sm font-medium text-blue-300 mb-1">Setup Instructions</p>
                  <p class="text-xs text-slate-400">Set the DISCORD_WEBHOOK_URL environment variable to enable notifications. Get your webhook URL from Discord Server Settings → Integrations → Webhooks.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Test Webhook -->
      <div class="glass rounded-xl p-6">
        <h2 class="text-lg font-semibold mb-4">Test Webhook</h2>
        <p class="text-slate-400 text-sm mb-4">Send a test notification to verify webhook configuration</p>
        
        <form method="POST" action="/admin/test-webhook" class="flex gap-3">
          <input type="hidden" name="pass" value="${pass}">
          <input name="message" class="flex-1 glass rounded-lg px-4 py-2.5 text-sm" placeholder="Test message (optional)">
          <button ${!DISCORD_WEBHOOK_URL ? 'disabled' : ''} class="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 ${!DISCORD_WEBHOOK_URL ? 'opacity-50 cursor-not-allowed' : ''} px-6 py-2.5 rounded-lg text-sm font-medium shadow-lg shadow-indigo-500/30 transition-all">
            Send Test
          </button>
        </form>
      </div>

      <!-- Webhook Logs (Future) -->
      <div class="glass rounded-xl p-6">
        <div class="text-center py-8">
          <svg class="w-12 h-12 text-slate-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
          </svg>
          <h3 class="text-lg font-semibold mb-2">Webhook History</h3>
          <p class="text-sm text-slate-400">Webhook delivery logs coming soon</p>
        </div>
      </div>
    </div>
  `;
}

async function renderSettingsPage(pass) {
  const totalKeys = await keysCollection.countDocuments();
  const totalChecks = await logsCollection.countDocuments();
  const totalEvents = await eventsCollection.countDocuments();
  const totalGetKeyClicks = await trafficCollection.countDocuments({ type: "getKey" });
  
  // Get current settings from database
  const settings = await settingsCollection.findOne({ _id: "global" }) || {
    discordWebhook: "",
    youtubeChannel: ""
  };
  
  return `
    <header class="glass border-b border-slate-800/50 px-6 py-5 sticky top-0 z-10">
      <div>
        <h1 class="text-2xl font-bold mb-1">Settings</h1>
        <p class="text-sm text-slate-400">System configuration</p>
      </div>
    </header>

    <div class="p-6 space-y-6">
      <!-- System Info -->
      <div class="glass rounded-xl p-6">
        <h2 class="text-lg font-semibold mb-4">System Information</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="glass rounded-lg p-4 border border-slate-700/50">
            <label class="block text-xs text-slate-400 mb-2 uppercase tracking-wider">Total Keys</label>
            <p class="text-2xl font-bold text-blue-300">${totalKeys}</p>
          </div>
          
          <div class="glass rounded-lg p-4 border border-slate-700/50">
            <label class="block text-xs text-slate-400 mb-2 uppercase tracking-wider">Total Checks</label>
            <p class="text-2xl font-bold text-emerald-300">${totalChecks}</p>
          </div>

          <div class="glass rounded-lg p-4 border border-slate-700/50">
            <label class="block text-xs text-slate-400 mb-2 uppercase tracking-wider">Total Events</label>
            <p class="text-2xl font-bold text-purple-300">${totalEvents}</p>
          </div>

          <div class="glass rounded-lg p-4 border border-slate-700/50">
            <label class="block text-xs text-slate-400 mb-2 uppercase tracking-wider">Get-Key Clicks</label>
            <p class="text-2xl font-bold text-amber-300">${totalGetKeyClicks}</p>
          </div>
        </div>
      </div>

      <!-- Environment Variables -->
      <div class="glass rounded-xl p-6">
        <h2 class="text-lg font-semibold mb-4">Configuration</h2>
        <div class="space-y-4">
          <div class="glass rounded-lg p-4 border border-slate-700/50">
            <div class="flex items-center justify-between mb-2">
              <label class="text-xs text-slate-400 uppercase tracking-wider">Admin Password</label>
              <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${ADMIN_PASSWORD === 'admin123' ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'}">
                ${ADMIN_PASSWORD === 'admin123' ? 'Default' : 'Custom'}
              </span>
            </div>
            <p class="text-sm text-slate-300 font-mono">••••••••</p>
            ${ADMIN_PASSWORD === 'admin123' ? '<p class="text-xs text-amber-400 mt-2">⚠️ Using default password. Set ADMIN_PASSWORD env variable for security.</p>' : ''}
          </div>

          <div class="glass rounded-lg p-4 border border-slate-700/50">
            <label class="block text-xs text-slate-400 mb-2 uppercase tracking-wider">YouTube Channel</label>
            <div class="flex gap-2">
              <input type="text" id="youtubeChannel" value="${settings.youtubeChannel}" class="flex-1 bg-slate-950/40 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-slate-300">
              <button onclick="saveSettings()" class="px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 rounded-lg text-sm font-medium border border-emerald-500/20">Save</button>
            </div>
            <p class="text-xs text-slate-400 mt-2">Used for checkpoint verification</p>
          </div>

          <div class="glass rounded-lg p-4 border border-slate-700/50">
            <label class="block text-xs text-slate-400 mb-2 uppercase tracking-wider">Discord Webhook URL</label>
            <div class="flex gap-2">
              <input type="text" id="discordWebhook" value="${settings.discordWebhook}" placeholder="https://discord.com/api/webhooks/..." class="flex-1 bg-slate-950/40 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-slate-300">
              <button onclick="saveSettings()" class="px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 rounded-lg text-sm font-medium border border-emerald-500/20">Save</button>
            </div>
            <p class="text-xs text-slate-400 mt-2">Notifications for new key generation</p>
          </div>
        </div>
      </div>

      <!-- Data Management -->
      <div class="glass rounded-xl p-6">
        <h2 class="text-lg font-semibold mb-4">Data Management</h2>
        <div class="space-y-3">
          <div class="flex items-center justify-between p-4 glass rounded-lg border border-slate-700/50">
            <div>
              <p class="font-medium mb-1">Clear Expired Keys</p>
              <p class="text-xs text-slate-400">Remove all keys that have expired</p>
            </div>
            <a href="/admin/delete-expired?pass=${pass}" onclick="return confirm('Delete all expired keys?')" class="px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded-lg text-sm font-medium border border-amber-500/20">
              Clear Expired
            </a>
          </div>

          <div class="flex items-center justify-between p-4 glass rounded-lg border border-slate-700/50">
            <div>
              <p class="font-medium mb-1">Clear Check Logs</p>
              <p class="text-xs text-slate-400">Remove verification attempt history (${totalChecks} entries)</p>
            </div>
            <form method="POST" action="/admin/clear-logs" onsubmit="return confirm('Clear all check logs?')">
              <input type="hidden" name="pass" value="${pass}">
              <button class="px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded-lg text-sm font-medium border border-amber-500/20">
                Clear Logs
              </button>
            </form>
          </div>

          <div class="flex items-center justify-between p-4 glass rounded-lg border border-rose-700/50">
            <div>
              <p class="font-medium mb-1 text-rose-300">Clear All Data</p>
              <p class="text-xs text-slate-400">⚠️ Remove all keys, logs, and events (cannot be undone)</p>
            </div>
            <form method="POST" action="/admin/clear-all" onsubmit="return confirm('⚠️ This will delete ALL data! Are you absolutely sure?')">
              <input type="hidden" name="pass" value="${pass}">
              <button class="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 rounded-lg text-sm font-medium border border-rose-500/20">
                Clear All
              </button>
            </form>
          </div>
        </div>
      </div>

      <!-- About -->
      <div class="glass rounded-xl p-6">
        <h2 class="text-lg font-semibold mb-4">About</h2>
        <div class="space-y-2 text-sm text-slate-300">
          <p><strong>Version:</strong> 1.0.0</p>
          <p><strong>Type:</strong> Key Management System</p>
          <p><strong>Storage:</strong> MongoDB (Persistent)</p>
          <p><strong>Database:</strong> key_management</p>
          <p><strong>Status:</strong> <span class="text-emerald-400">Running</span></p>
        </div>
      </div>
    </div>
    
    <script>
      async function saveSettings() {
        const youtubeChannel = document.getElementById('youtubeChannel').value;
        const discordWebhook = document.getElementById('discordWebhook').value;
        
        try {
          const response = await fetch('/admin/settings/save?pass=${pass}', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ youtubeChannel, discordWebhook })
          });
          
          const result = await response.json();
          
          if (result.success) {
            alert('✅ Settings saved successfully!');
          } else {
            alert('❌ Error: ' + (result.error || 'Unknown error'));
          }
        } catch (error) {
          alert('❌ Error saving settings: ' + error.message);
        }
      }
    </script>
  `;
}

// ===================== ANALYTICS PAGE =====================
async function renderAnalyticsPage(pass) {
  // Get geo stats
  const geoStats = await geoStatsCollection.find().sort({ totalRequests: -1 }).toArray();
  
  // Calculate totals
  const totalRequests = geoStats.reduce((sum, stat) => sum + stat.totalRequests, 0);
  const totalCountries = geoStats.length;
  
  // Top 10 countries
  const topCountries = geoStats.slice(0, 10);
  
  return `
    <header class="glass border-b border-slate-800/50 px-6 py-5 sticky top-0 z-10">
      <div>
        <h1 class="text-2xl font-bold mb-1">🌍 Analytics & Geolocation</h1>
        <p class="text-sm text-slate-400">Global user statistics</p>
      </div>
    </header>

    <div class="p-6 space-y-6">
      <!-- Summary Cards -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="glass rounded-xl p-6 border border-blue-500/20">
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-sm font-medium text-slate-400">Total Requests</h3>
            <svg class="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
            </svg>
          </div>
          <p class="text-3xl font-bold text-white">${totalRequests.toLocaleString()}</p>
          <p class="text-xs text-slate-500 mt-1">All-time checks</p>
        </div>

        <div class="glass rounded-xl p-6 border border-emerald-500/20">
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-sm font-medium text-slate-400">Countries</h3>
            <svg class="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </div>
          <p class="text-3xl font-bold text-white">${totalCountries}</p>
          <p class="text-xs text-slate-500 mt-1">Unique countries</p>
        </div>

        <div class="glass rounded-xl p-6 border border-purple-500/20">
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-sm font-medium text-slate-400">Top Country</h3>
            <svg class="w-8 h-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/>
            </svg>
          </div>
          <p class="text-3xl font-bold text-white">${topCountries[0]?.countryCode || 'N/A'}</p>
          <p class="text-xs text-slate-500 mt-1">${topCountries[0]?.country || 'No data'} - ${topCountries[0]?.totalRequests || 0} requests</p>
        </div>
      </div>

      <!-- Top Countries Table -->
      <div class="glass rounded-xl p-6">
        <h2 class="text-lg font-semibold mb-4 flex items-center gap-2">
          <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
          </svg>
          Top 10 Countries
        </h2>
        
        <div class="space-y-3">
          ${topCountries.map((stat, index) => {
            const percentage = ((stat.totalRequests / totalRequests) * 100).toFixed(1);
            const flagEmoji = stat.countryCode === 'US' ? '🇺🇸' : 
                            stat.countryCode === 'BR' ? '🇧🇷' :
                            stat.countryCode === 'RU' ? '🇷🇺' :
                            stat.countryCode === 'PH' ? '🇵🇭' :
                            stat.countryCode === 'DE' ? '🇩🇪' :
                            stat.countryCode === 'GB' ? '🇬🇧' :
                            stat.countryCode === 'CA' ? '🇨🇦' :
                            stat.countryCode === 'FR' ? '🇫🇷' :
                            stat.countryCode === 'IN' ? '🇮🇳' :
                            stat.countryCode === 'CN' ? '🇨🇳' : '🌍';
            
            return `
              <div class="glass rounded-lg p-4 hover:border-blue-500/30 transition-all">
                <div class="flex items-center justify-between mb-2">
                  <div class="flex items-center gap-3">
                    <span class="text-2xl">${flagEmoji}</span>
                    <div>
                      <p class="font-semibold text-white">${stat.country}</p>
                      <p class="text-xs text-slate-500">${stat.countryCode}</p>
                    </div>
                  </div>
                  <div class="text-right">
                    <p class="text-lg font-bold text-blue-400">${stat.totalRequests.toLocaleString()}</p>
                    <p class="text-xs text-slate-500">${percentage}%</p>
                  </div>
                </div>
                
                <!-- Progress Bar -->
                <div class="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div class="h-full bg-gradient-to-r from-blue-500 to-purple-500" style="width: ${percentage}%"></div>
                </div>
                
                ${stat.actions ? `
                  <div class="mt-3 flex gap-3 text-xs">
                    <span class="text-slate-400">Checks: <span class="text-emerald-400">${stat.actions.check || 0}</span></span>
                  </div>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>

      ${geoStats.length === 0 ? `
        <div class="glass rounded-xl p-12 text-center">
          <div class="w-20 h-20 mx-auto mb-4 rounded-full bg-slate-800 flex items-center justify-center">
            <svg class="w-10 h-10 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
            </svg>
          </div>
          <h3 class="text-xl font-semibold mb-2 text-slate-300">No Analytics Data Yet</h3>
          <p class="text-slate-500 mb-4">Wait for users to check their keys</p>
        </div>
      ` : ''}
    </div>
  `;
}

// ===================== HELPERS =====================

async function addEvent(type, key) {
  await eventsCollection.insertOne({ type, key, at: new Date() });
  // Clean old events (keep last 2000)
  const count = await eventsCollection.countDocuments();
  if (count > 2000) {
    const oldEvents = await eventsCollection.find().sort({ at: 1 }).limit(count - 2000).toArray();
    if (oldEvents.length > 0) {
      await eventsCollection.deleteMany({ _id: { $in: oldEvents.map(e => e._id) } });
    }
  }
}

async function countEventsInRange(days, type) {
  const limit = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const query = { at: { $gte: limit } };
  if (type) query.type = type;
  return await eventsCollection.countDocuments(query);
}

async function countTrafficInRange(type, days) {
  const limit = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return await trafficCollection.countDocuments({ type, at: { $gte: limit } });
}

function makeKey() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

function getBaseUrl(req) {
  return `${req.protocol}://${req.get("host")}`;
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const obj = {};
  if (!header) return obj;
  header.split(";").forEach((pair) => {
    const [k, ...v] = pair.trim().split("=");
    obj[k] = decodeURIComponent(v.join("="));
  });
  return obj;
}


async function sendWebhook(eventName, data) {
  // Get webhook URL from database
  const settings = await settingsCollection.findOne({ _id: "global" });
  const webhookUrl = settings?.discordWebhook || DISCORD_WEBHOOK_URL;
  
  if (!webhookUrl) return;
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "Key Bot",
        embeds: [
          {
            title: eventName,
            color: 0x5865f2,
            timestamp: new Date().toISOString(),
            fields: Object.entries(data || {}).map(([name, value]) => ({
              name,
              value:
                value === undefined || value === null ? "—" : String(value),
              inline: true,
            })),
          },
        ],
      }),
    });
  } catch (e) {
    console.error("webhook error", e);
  }
}

// ===================== LOOTLABS API =====================
async function createLootlabsLink(provider) {
  try {
    const apiKey = provider.config?.apiKey;
    const baseLink = provider.config?.linkUrl; // Static Lootlabs link (e.g., https://loot-link.com/s?qo0f)
    
    if (!apiKey || !baseLink) {
      console.error('Lootlabs: Missing API key or base link');
      return baseLink || ''; // Fallback to static link
    }
    
    // Generate unique session token for this user
    const sessionToken = crypto.randomBytes(16).toString('hex');
    
    // Prepare returnUrl with session token
    const returnUrl = `${BASE_URL}/monetization-callback/lootlabs?session=${sessionToken}`;
    
    // Encrypt the returnUrl using Lootlabs API
    const encryptResponse = await fetch('https://creators.lootlabs.gg/api/public/url_encryptor', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        destination_url: returnUrl,
        api_token: apiKey
      })
    });
    
    if (!encryptResponse.ok) {
      const errorText = await encryptResponse.text();
      console.error('Lootlabs encrypt error:', encryptResponse.status, errorText);
      return baseLink; // Fallback to static link without encryption
    }
    
    const encryptResult = await encryptResponse.json();
    
    if ((encryptResult.type === 'created' || encryptResult.type === 'fetched') && encryptResult.message) {
      const encryptedUrl = encryptResult.message;
      
      // Store session token temporarily (expires in 1 hour)
      await trafficCollection.insertOne({
        type: 'lootlabs_session',
        sessionToken,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
        used: false
      });
      
      // Combine base link with encrypted data parameter
      const finalLink = `${baseLink}&data=${encryptedUrl}`;
      
      console.log('✅ Lootlabs Anti-Bypass link created with session:', sessionToken);
      return finalLink;
    } else {
      console.error('Lootlabs: Unexpected encryption response:', encryptResult);
      return baseLink;
    }
  } catch (error) {
    console.error('Lootlabs createLink error:', error);
    return provider.config?.linkUrl || ''; // Fallback to static link
  }
}

// ===================== GEOLOCATION =====================
async function getGeoLocation(ip) {
  // Skip local IPs
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return { country: 'Local', countryCode: 'LC', city: 'Localhost', ip };
  }
  
  try {
    // Use free ipapi.co service (no API key needed, 1000 req/day)
    const response = await fetch(`https://ipapi.co/${ip}/json/`, {
      timeout: 3000
    });
    
    if (!response.ok) {
      return { country: 'Unknown', countryCode: 'XX', city: 'Unknown', ip };
    }
    
    const data = await response.json();
    
    return {
      ip,
      country: data.country_name || 'Unknown',
      countryCode: data.country_code || 'XX',
      city: data.city || 'Unknown',
      region: data.region || '',
      timezone: data.timezone || '',
      latitude: data.latitude || 0,
      longitude: data.longitude || 0
    };
  } catch (error) {
    console.error('Geolocation error:', error);
    return { country: 'Unknown', countryCode: 'XX', city: 'Unknown', ip };
  }
}

async function saveGeoStat(ip, action = 'check') {
  try {
    const geo = await getGeoLocation(ip);
    
    // Save or update stats for this country
    await geoStatsCollection.updateOne(
      { countryCode: geo.countryCode },
      {
        $set: {
          country: geo.country,
          countryCode: geo.countryCode,
          lastSeen: new Date()
        },
        $inc: {
          totalRequests: 1,
          [`actions.${action}`]: 1
        }
      },
      { upsert: true }
    );
    
    return geo;
  } catch (error) {
    console.error('Save geo stat error:', error);
    return null;
  }
}

// ===================== ADMIN GUARD =====================

function renderLogin() {
  return `
  <!doctype html><html><head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Admin Login</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
      @keyframes gradient {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
      body {
        background: linear-gradient(-45deg, #0f172a, #1e1b4b, #312e81, #1e293b);
        background-size: 400% 400%;
        animation: gradient 15s ease infinite;
      }
      .glass {
        background: rgba(15, 23, 42, 0.7);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(148, 163, 184, 0.1);
      }
    </style>
  </head>
  <body class="min-h-screen flex items-center justify-center p-4">
    <div class="w-full max-w-md">
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 mb-4 shadow-2xl shadow-blue-500/30">
          <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
          </svg>
        </div>
        <h1 class="text-3xl font-bold text-white mb-2">Admin Access</h1>
        <p class="text-slate-400">Enter your credentials to continue</p>
      </div>
      
      <form method="GET" action="/admin" class="glass rounded-2xl p-8 shadow-2xl">
        <div class="space-y-6">
          <div>
            <label class="block text-sm font-medium text-slate-300 mb-2">Password</label>
            <input 
              name="pass" 
              type="password" 
              required
              class="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" 
              placeholder="Enter admin password"
            />
          </div>
          
          <button class="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 py-3 rounded-xl text-white font-semibold shadow-lg shadow-blue-500/30 transition-all transform hover:scale-[1.02] active:scale-[0.98]">
            Sign In
          </button>
        </div>
      </form>
      
      <p class="text-center text-slate-500 text-sm mt-6">Protected by enterprise-grade security</p>
    </div>
  </body>
  </html>`;
}

function requireAdmin(req, res, next) {
  const pass = req.query.pass || req.body.pass;
  if (pass === ADMIN_PASSWORD) return next();
  res.send(renderLogin());
}

// ===================== ROUTES =====================

app.get("/gate", (req, res) => {
  res.json({
    url: getBaseUrl(req) + "/get-key",
  });
});

app.get("/get-key", async (req, res) => {
  await trafficCollection.insertOne({ type: "getKey", at: new Date() });
  const cookies = parseCookies(req);
  
  // Check for monetization token in cookies
  if (cookies.monetization_token || cookies.wik_token) {
    const token = cookies.monetization_token || cookies.wik_token;
    const keyData = await keysCollection.findOne({ fromMonetizationToken: token }) || 
                    await keysCollection.findOne({ fromWorkInkToken: token });
    if (keyData) {
      return renderKeyPage(res, keyData.key, keyData);
    }
  }

  // Get enabled checkpoints
  const allCheckpoints = await checkpointsCollection.find({ enabled: true }).sort({ order: 1 }).toArray();
  
  // Group checkpoints by step
  const steps = [];
  const processedGroups = new Set();
  
  for (const cp of allCheckpoints) {
    if (cp.groupId && !processedGroups.has(cp.groupId)) {
      // Find all checkpoints in this group
      const groupCheckpoints = allCheckpoints.filter(c => c.groupId === cp.groupId);
      steps.push({
        type: 'group',
        groupId: cp.groupId,
        groupName: cp.groupName || 'Complete tasks',
        groupMode: cp.groupMode || 'all',
        checkpoints: groupCheckpoints
      });
      processedGroups.add(cp.groupId);
    } else if (!cp.groupId) {
      // Single checkpoint
      steps.push({
        type: 'single',
        checkpoint: cp
      });
    }
  }
  
  const currentStep = parseInt(req.query.step || '0');
  
  // If no checkpoints or completed all, go to monetization provider
  if (steps.length === 0 || currentStep >= steps.length) {
    return res.send(await renderWorkinkStep());
  }
  
  // Render current step
  const step = steps[currentStep];
  if (step.type === 'group') {
    return res.send(renderGroupCheckpointStep(step, currentStep, steps.length));
  } else {
    return res.send(renderCheckpointStep(step.checkpoint, currentStep, steps.length));
  }

});

// ===================== CHECKPOINT RENDERING =====================

function renderCheckpointStep(checkpoint, currentStep, totalSteps) {
  const iconMap = {
    youtube: '<svg class="w-7 h-7" fill="currentColor" viewBox="0 0 24 24"><path d="M21.8 8s-.2-1.5-.8-2.2c-.8-.8-1.6-.8-2-.9C15.8 4.7 12 4.7 12 4.7s-3.8 0-7 .2c-.4 0-1.2.1-2 .9C2.3 6.5 2.2 8 2.2 8S2 9.6 2 11.3v1.3C2 14.3 2.2 16 2.2 16s.2 1.5.8 2.2c.8.8 1.6.8 2 .9 1.4.1 7 .2 7 .2s3.8 0 7-.2c.4-.1 1.2-.1 2-.9.6-.7.8-2.2.8-2.2s.2-1.7.2-3.4V11.3C22 9.6 21.8 8 21.8 8zM10 14.7V9.3l5.3 2.7L10 14.7z"/></svg>',
    discord: '<svg class="w-7 h-7" fill="currentColor" viewBox="0 0 24 24"><path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515a.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0a12.64 12.64 0 00-.617-1.25a.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057a19.9 19.9 0 005.993 3.03a.078.078 0 00.084-.028a14.09 14.09 0 001.226-1.994a.076.076 0 00-.041-.106a13.107 13.107 0 01-1.872-.892a.077.077 0 01-.008-.128a10.2 10.2 0 00.372-.292a.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127a12.299 12.299 0 01-1.873.892a.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028a19.839 19.839 0 006.002-3.03a.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z"/></svg>',
    twitter: '<svg class="w-7 h-7" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
    custom: '<svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>'
  };
  
  const colorMap = {
    youtube: 'from-red-500 to-pink-600',
    discord: 'from-indigo-500 to-purple-600',
    twitter: 'from-blue-400 to-blue-600',
    custom: 'from-emerald-500 to-blue-600'
  };

  return `
  <!doctype html><html><head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Checkpoint ${currentStep + 1}/${totalSteps}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
      @keyframes gradient {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
      body { 
        background: linear-gradient(-45deg, #0f172a, #1e1b4b, #312e81, #1e293b);
        background-size: 400% 400%;
        animation: gradient 15s ease infinite;
      }
      .glass {
        background: rgba(15, 23, 42, 0.7);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(148, 163, 184, 0.1);
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
      .pulse-dot {
        animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
      }
      @keyframes slideIn {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      .slide-in {
        animation: slideIn 0.5s ease-out;
      }
    </style>
  </head>
  <body class="flex items-center justify-center min-h-screen p-4 text-white">
    <div class="max-w-2xl w-full space-y-6 slide-in">
      <!-- Header -->
      <div class="text-center">
        <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br ${colorMap[checkpoint.type] || colorMap.custom} mb-4 shadow-2xl">
          ${iconMap[checkpoint.type] || iconMap.custom}
        </div>
        <h1 class="text-3xl font-bold mb-2">Checkpoint ${currentStep + 1} of ${totalSteps}</h1>
        <p class="text-slate-400">${checkpoint.name}</p>
      </div>

      <!-- Progress Bar -->
      <div class="glass rounded-xl p-4">
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm font-medium">Progress</span>
          <span class="text-sm text-slate-400">${currentStep + 1}/${totalSteps}</span>
        </div>
        <div class="w-full bg-slate-800 rounded-full h-2">
          <div class="bg-gradient-to-r from-emerald-500 to-blue-600 h-2 rounded-full transition-all" style="width: ${((currentStep + 1) / totalSteps) * 100}%"></div>
        </div>
      </div>

      <!-- Main Card -->
      <div class="glass rounded-2xl p-6 shadow-2xl">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h2 class="text-xl font-semibold">${checkpoint.name}</h2>
            <p class="text-slate-400 text-sm mt-1">${checkpoint.description}</p>
          </div>
          <div class="flex items-center gap-2 text-emerald-400 text-sm px-3 py-1.5 rounded-full bg-emerald-500/10">
            <span class="w-2 h-2 rounded-full bg-emerald-400 pulse-dot"></span>
            Secure
          </div>
        </div>

        <!-- Action Box -->
          <div class="glass rounded-xl p-5 border border-slate-700/50">
            <div class="flex items-center gap-4">
            <div class="flex-shrink-0 w-14 h-14 rounded-xl bg-gradient-to-br ${colorMap[checkpoint.type] || colorMap.custom} flex items-center justify-center shadow-lg">
              ${iconMap[checkpoint.type] || iconMap.custom}
              </div>
              <div class="flex-1">
              <div class="text-base font-semibold mb-1">${checkpoint.name}</div>
              <div id="action-label" class="text-sm text-slate-400">Click the button to start</div>
              </div>
            <a id="open-link" href="${checkpoint.url}" target="_blank" class="flex-shrink-0 px-5 py-2.5 rounded-lg bg-gradient-to-r from-slate-700 to-slate-600 hover:from-slate-600 hover:to-slate-500 text-sm font-medium transition-all transform hover:scale-105 active:scale-95 shadow-lg">
              Open
              </a>
          </div>
        </div>

        <!-- Timer Box -->
        <div id="wait-box" class="mt-6 glass rounded-xl p-5 border border-amber-500/30 bg-amber-500/5">
          <div class="flex items-center justify-between">
            <div>
              <p id="wait-title" class="text-sm font-semibold text-amber-100">Waiting for action...</p>
              <p id="wait-desc" class="text-sm text-slate-300 mt-1">Click the button above to start</p>
            </div>
            <div class="text-right">
              <span id="wait-timer" class="text-3xl font-bold text-amber-100">${checkpoint.waitTime}</span>
              <p class="text-xs text-slate-400 mt-1">seconds</p>
            </div>
          </div>
        </div>

        <!-- Submit -->
        <form method="GET" action="/get-key" class="mt-6">
          <input type="hidden" name="step" value="${currentStep + 1}">
          <button id="confirm-btn" disabled class="w-full py-3.5 rounded-xl bg-slate-700 text-slate-400 cursor-not-allowed font-semibold transition-all text-base">
            Continue to ${currentStep + 1 < totalSteps ? 'Next Checkpoint' : 'Final Step'}
          </button>
        </form>
      </div>

      <!-- Footer -->
      <div class="text-center text-slate-500 text-sm">
        <p>🔒 Protected by advanced security measures</p>
      </div>
    </div>

    <script>
      const openBtn = document.getElementById('open-link');
      const confirmBtn = document.getElementById('confirm-btn');
      const waitBox = document.getElementById('wait-box');
      const waitTimer = document.getElementById('wait-timer');
      const waitTitle = document.getElementById('wait-title');
      const waitDesc = document.getElementById('wait-desc');
      const actionLabel = document.getElementById('action-label');

      let started = false;
      openBtn.addEventListener('click', () => {
        if (started) return;
        started = true;
        waitTitle.textContent = 'Timer started...';
        waitDesc.textContent = 'Please stay on the page';
        actionLabel.textContent = 'Timer is running...';
        let left = ${checkpoint.waitTime};
        const iv = setInterval(() => {
          left--;
          if (left > 0) {
            waitTimer.textContent = left;
          } else {
            clearInterval(iv);
            waitBox.className = "mt-6 glass rounded-xl p-5 border border-emerald-500/30 bg-emerald-500/5";
            waitTitle.textContent = "Checkpoint Complete";
            waitDesc.textContent = "You can now continue";
            waitTimer.textContent = "✓";
            confirmBtn.disabled = false;
            confirmBtn.className = "w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-blue-600 hover:from-emerald-600 hover:to-blue-700 text-white font-semibold transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-emerald-500/30 text-base";
            actionLabel.textContent = "Completed successfully";
            actionLabel.className = "text-sm text-emerald-400";
          }
        }, 1000);
      });
    </script>
  </body></html>
  `;
}

function renderGroupCheckpointStep(step, currentStep, totalSteps) {
  const { groupName, groupMode, checkpoints } = step;
  
  const iconMap = {
    youtube: '<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M21.8 8s-.2-1.5-.8-2.2c-.8-.8-1.6-.8-2-.9C15.8 4.7 12 4.7 12 4.7s-3.8 0-7 .2c-.4 0-1.2.1-2 .9C2.3 6.5 2.2 8 2.2 8S2 9.6 2 11.3v1.3C2 14.3 2.2 16 2.2 16s.2 1.5.8 2.2c.8.8 1.6.8 2 .9 1.4.1 7 .2 7 .2s3.8 0 7-.2c.4-.1 1.2-.1 2-.9.6-.7.8-2.2.8-2.2s.2-1.7.2-3.4V11.3C22 9.6 21.8 8 21.8 8zM10 14.7V9.3l5.3 2.7L10 14.7z"/></svg>',
    discord: '<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515a.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0a12.64 12.64 0 00-.617-1.25a.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057a19.9 19.9 0 005.993 3.03a.078.078 0 00.084-.028a14.09 14.09 0 001.226-1.994a.076.076 0 00-.041-.106a13.107 13.107 0 01-1.872-.892a.077.077 0 01-.008-.128a10.2 10.2 0 00.372-.292a.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127a12.299 12.299 0 01-1.873.892a.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028a19.839 19.839 0 006.002-3.03a.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z"/></svg>',
    twitter: '<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
    custom: '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>'
  };
  
  const colorMap = {
    youtube: 'from-red-500 to-pink-600',
    discord: 'from-indigo-500 to-purple-600',
    twitter: 'from-blue-400 to-blue-600',
    custom: 'from-emerald-500 to-blue-600'
  };

  const tasksHtml = checkpoints.map((cp, idx) => `
    <div class="glass rounded-xl p-4 border border-slate-700/50 task-item" data-task-id="${idx}">
      <div class="flex items-center gap-4">
        <div class="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br ${colorMap[cp.type] || colorMap.custom} flex items-center justify-center shadow-lg">
          ${iconMap[cp.type] || iconMap.custom}
        </div>
        <div class="flex-1">
          <div class="text-base font-semibold mb-1">${cp.name}</div>
          <div class="text-sm text-slate-400">${cp.description}</div>
        </div>
        <div class="flex-shrink-0 flex items-center gap-2">
          <span id="status-${idx}" class="px-3 py-1 rounded-lg text-xs font-medium bg-slate-700 text-slate-300">Pending</span>
          <button id="btn-${idx}" onclick="startTask(${idx}, '${cp.url}', ${cp.waitTime})" class="px-4 py-2 rounded-lg bg-gradient-to-r from-slate-700 to-slate-600 hover:from-slate-600 hover:to-slate-500 text-sm font-medium transition-all">
            Start
          </button>
        </div>
      </div>
      <div id="timer-${idx}" class="hidden mt-3 glass rounded-lg p-3 bg-amber-500/5 border border-amber-500/20">
        <div class="flex items-center justify-between">
          <span class="text-sm text-amber-100">Timer running...</span>
          <span id="time-${idx}" class="text-xl font-bold text-amber-100">${cp.waitTime}</span>
        </div>
      </div>
    </div>
  `).join('');

  const modeText = groupMode === 'any' 
    ? '<span class="text-amber-300">Complete ANY ONE task</span>' 
    : '<span class="text-blue-300">Complete ALL tasks</span>';

  return `
  <!doctype html><html><head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Checkpoint ${currentStep + 1}/${totalSteps}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
      @keyframes gradient {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
      body { 
        background: linear-gradient(-45deg, #0f172a, #1e1b4b, #312e81, #1e293b);
        background-size: 400% 400%;
        animation: gradient 15s ease infinite;
      }
      .glass {
        background: rgba(15, 23, 42, 0.7);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(148, 163, 184, 0.1);
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
      .pulse-dot {
        animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
      }
      @keyframes slideIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .slide-in {
        animation: slideIn 0.5s ease-out;
      }
    </style>
  </head>
  <body class="flex items-center justify-center min-h-screen p-4 text-white">
    <div class="max-w-3xl w-full space-y-6 slide-in">
      <!-- Header -->
      <div class="text-center">
        <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-600 mb-4 shadow-2xl">
          <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
          </svg>
        </div>
        <h1 class="text-3xl font-bold mb-2">Checkpoint ${currentStep + 1} of ${totalSteps}</h1>
        <p class="text-slate-400">${groupName}</p>
      </div>

      <!-- Progress Bar -->
      <div class="glass rounded-xl p-4">
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm font-medium">Progress</span>
          <span class="text-sm text-slate-400">${currentStep + 1}/${totalSteps}</span>
        </div>
        <div class="w-full bg-slate-800 rounded-full h-2">
          <div class="bg-gradient-to-r from-emerald-500 to-blue-600 h-2 rounded-full transition-all" style="width: ${((currentStep + 1) / totalSteps) * 100}%"></div>
        </div>
      </div>

      <!-- Main Card -->
      <div class="glass rounded-2xl p-6 shadow-2xl">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h2 class="text-xl font-semibold">${groupName}</h2>
            <p class="text-slate-400 text-sm mt-1">${modeText}</p>
          </div>
          <div class="flex items-center gap-2 text-emerald-400 text-sm px-3 py-1.5 rounded-full bg-emerald-500/10">
            <span class="w-2 h-2 rounded-full bg-emerald-400 pulse-dot"></span>
            ${groupMode === 'any' ? 'Choice' : 'Required'}
          </div>
        </div>

        <!-- Task Counter -->
        <div class="mb-4 p-3 glass rounded-lg bg-blue-500/5 border border-blue-500/20">
          <div class="flex items-center justify-between">
            <span class="text-sm">Completed:</span>
            <span id="task-counter" class="text-lg font-bold text-blue-300">0 / ${checkpoints.length}</span>
          </div>
        </div>

        <!-- Tasks List -->
        <div class="space-y-3">
          ${tasksHtml}
        </div>

        <!-- Continue Button -->
        <form method="GET" action="/get-key" class="mt-6">
          <input type="hidden" name="step" value="${currentStep + 1}">
          <button id="continue-btn" disabled class="w-full py-3.5 rounded-xl bg-slate-700 text-slate-400 cursor-not-allowed font-semibold transition-all text-base">
            Complete ${groupMode === 'any' ? 'at least 1 task' : 'all tasks'} to continue
          </button>
        </form>
      </div>

      <!-- Footer -->
      <div class="text-center text-slate-500 text-sm">
        <p>🔒 Protected by advanced security measures</p>
      </div>
    </div>

    <script>
      const groupMode = '${groupMode}';
      const totalTasks = ${checkpoints.length};
      let completedTasks = 0;
      const taskTimers = {};

      function updateCounter() {
        document.getElementById('task-counter').textContent = completedTasks + ' / ' + totalTasks;
        
        const continueBtn = document.getElementById('continue-btn');
        const canContinue = (groupMode === 'any' && completedTasks >= 1) || 
                           (groupMode === 'all' && completedTasks === totalTasks);
        
        if (canContinue) {
          continueBtn.disabled = false;
          continueBtn.className = "w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-blue-600 hover:from-emerald-600 hover:to-blue-700 text-white font-semibold transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-emerald-500/30 text-base";
          continueBtn.textContent = 'Continue to ${currentStep + 1 < totalSteps ? 'Next Checkpoint' : 'Final Step'}';
        }
      }

      function startTask(taskId, url, waitTime) {
        if (taskTimers[taskId]) return;
        
        window.open(url, '_blank');
        
        const btn = document.getElementById('btn-' + taskId);
        const status = document.getElementById('status-' + taskId);
        const timerDiv = document.getElementById('timer-' + taskId);
        const timeSpan = document.getElementById('time-' + taskId);
        
        btn.disabled = true;
        btn.textContent = 'Running...';
        btn.className = 'px-4 py-2 rounded-lg bg-slate-600 text-slate-400 text-sm font-medium cursor-not-allowed';
        status.textContent = 'In Progress';
        status.className = 'px-3 py-1 rounded-lg text-xs font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20';
        timerDiv.classList.remove('hidden');
        
        let timeLeft = waitTime;
        taskTimers[taskId] = setInterval(() => {
          timeLeft--;
          timeSpan.textContent = timeLeft;
          
          if (timeLeft <= 0) {
            clearInterval(taskTimers[taskId]);
            completeTask(taskId);
          }
        }, 1000);
      }

      function completeTask(taskId) {
        const btn = document.getElementById('btn-' + taskId);
        const status = document.getElementById('status-' + taskId);
        const timerDiv = document.getElementById('timer-' + taskId);
        
        btn.textContent = '✓ Done';
        btn.className = 'px-4 py-2 rounded-lg bg-emerald-500/10 text-emerald-300 text-sm font-medium border border-emerald-500/20 cursor-default';
        status.textContent = 'Completed';
        status.className = 'px-3 py-1 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20';
        timerDiv.innerHTML = '<div class="text-center text-sm text-emerald-300">✓ Completed!</div>';
        
        completedTasks++;
        updateCounter();
      }
    </script>
  </body></html>
  `;
}

async function renderWorkinkStep() {
  const activeProvider = await monetizationProvidersCollection.findOne({ isActive: true });
  
  // Generate monetization link (dynamic or static)
  let providerLink;
  if (activeProvider?.type === 'lootlabs' && activeProvider?.config?.useApiKey && activeProvider?.config?.apiKey) {
    // Dynamically create Lootlabs link via API
    providerLink = await createLootlabsLink(activeProvider);
  } else {
    // Use static link from config
    providerLink = activeProvider?.config?.linkUrl || WORKINK_LINK;
  }
  
  const providerName = activeProvider?.name || "Monetization";
  
  return `
  <!doctype html><html><head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Final Step</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
      @keyframes gradient {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
      body { 
        background: linear-gradient(-45deg, #0f172a, #1e1b4b, #312e81, #1e293b);
        background-size: 400% 400%;
        animation: gradient 15s ease infinite;
      }
      .glass {
        background: rgba(15, 23, 42, 0.7);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(148, 163, 184, 0.1);
      }
    </style>
  </head><body class="flex items-center justify-center min-h-screen p-4">
    <div class="max-w-lg w-full space-y-6">
      <div class="text-center">
        <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-600 mb-4 shadow-2xl shadow-purple-500/30">
          <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
          </svg>
        </div>
        <h1 class="text-3xl font-bold text-white mb-2">Almost There!</h1>
        <p class="text-slate-400">One more step to get your key</p>
      </div>

      <div class="glass rounded-2xl p-8 shadow-2xl text-center space-y-6">
        <div class="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600">
          <span class="text-2xl font-bold text-white">✓</span>
        </div>
        
        <div>
          <h2 class="text-2xl font-bold text-white mb-3">All Checkpoints Complete!</h2>
          <p class="text-slate-300 leading-relaxed">After completing the ${providerName} verification, you'll be automatically redirected back here with your access key.</p>
        </div>
        
        <div class="bg-slate-900/50 rounded-xl p-4 border border-slate-700">
          <div class="flex items-center gap-3 text-sm text-slate-300">
            <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <span>Keep this tab open during verification</span>
          </div>
        </div>
        
        <a href="${providerLink}" target="_blank" class="inline-block w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 py-4 rounded-xl font-semibold shadow-lg shadow-blue-500/30 transition-all transform hover:scale-[1.02] active:scale-[0.98] text-white">
          Open ${providerName} Verification
        </a>
      </div>
    </div>
  </body></html>
  `;
}

// ===================== MONETIZATION CALLBACKS =====================

app.get("/monetization-callback/:providerId", async (req, res) => {
  const { providerId } = req.params;
  const provider = await monetizationProvidersCollection.findOne({ id: providerId });
  
  if (!provider) {
    return res.status(404).send("Provider not found");
  }

  try {
    let key, keyObj;
    
    if (providerId === "workink") {
  const { token } = req.query;
  if (!token) return res.status(400).send("No token");

      // Check if key already exists
      const existingKey = await keysCollection.findOne({ fromMonetizationToken: token });
      if (existingKey) {
        res.setHeader("Set-Cookie", `monetization_token=${encodeURIComponent(token)}; Path=/; Max-Age=3600`);
        return renderKeyPage(res, existingKey.key, existingKey);
      }

      // Validate with Work.ink
    const url = `https://work.ink/_api/v2/token/isValid/${token}?deleteToken=1&forbiddenOnFail=0`;
      const fetchOptions = {
        method: 'GET',
        headers: {}
      };
      
      // Add API key authentication if enabled
      if (provider.config?.useApiKey && provider.config?.apiKey) {
        fetchOptions.headers['Authorization'] = `Bearer ${provider.config.apiKey}`;
        // or use API key in different format depending on Work.ink docs:
        // fetchOptions.headers['X-API-Key'] = provider.config.apiKey;
      }
      
      const resp = await fetch(url, fetchOptions);
    const data = await resp.json();
      
    if (!data.valid) {
        return res.status(403).send("Token validation failed");
      }

      key = makeKey();
      const duration = provider.config?.keyDuration || 1;
      keyObj = {
      key,
      createdAt: new Date(),
        expiresAt: new Date(Date.now() + duration * 60 * 60 * 1000),
      isActive: true,
      usageCount: 0,
      maxUsage: null,
        source: providerId,
        fromMonetizationToken: token,
        provider: provider.name,
      hwid: null,
      robloxUserId: null,
      robloxUsername: null,
    };

      res.setHeader("Set-Cookie", `monetization_token=${encodeURIComponent(token)}; Path=/; Max-Age=3600`);
      
    } else if (providerId === "lootlabs") {
      const { session, token, userId } = req.query;
      
      // Check if using API key mode (session-based validation)
      if (provider.config?.useApiKey && session) {
        // Validate session token
        const sessionData = await trafficCollection.findOne({
          type: 'lootlabs_session',
          sessionToken: session,
          used: false,
          expiresAt: { $gt: new Date() }
        });
        
        if (!sessionData) {
          return res.status(400).send("Invalid or expired session");
        }
        
        // Mark session as used
        await trafficCollection.updateOne(
          { _id: sessionData._id },
          { $set: { used: true, usedAt: new Date() } }
        );
        
        // Check if key already exists for this session
        const existingKey = await keysCollection.findOne({ fromMonetizationToken: session });
        if (existingKey) {
          return renderKeyPage(res, existingKey.key, existingKey);
        }
        
        console.log('✅ Lootlabs API: Session validated successfully');
        
        key = makeKey();
        const duration = provider.config?.keyDuration || 1;
        keyObj = {
          key,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + duration * 60 * 60 * 1000),
          isActive: true,
          usageCount: 0,
          maxUsage: null,
          source: providerId,
          fromMonetizationToken: session,
          provider: provider.name,
          hwid: null,
          robloxUserId: userId || null,
          robloxUsername: null,
        };
        
      } else {
        // Static link mode (no API key) - basic validation
        if (!token) return res.status(400).send("No token");
        
        // Check if key already exists
        const existingKey = await keysCollection.findOne({ fromMonetizationToken: token });
        if (existingKey) {
          return renderKeyPage(res, existingKey.key, existingKey);
        }
        
        console.log('⚠️ Lootlabs: Using static link mode (no API validation)');
        
        key = makeKey();
        const duration = provider.config?.keyDuration || 1;
        keyObj = {
          key,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + duration * 60 * 60 * 1000),
          isActive: true,
          usageCount: 0,
          maxUsage: null,
          source: providerId,
          fromMonetizationToken: token,
          provider: provider.name,
          hwid: null,
          robloxUserId: userId || null,
          robloxUsername: null,
        };
      }
      
    } else if (providerId === "linkvertise") {
      const { token, userId, target } = req.query;
      if (!token) return res.status(400).send("No token");

      // Check if key already exists
      const existingKey = await keysCollection.findOne({ fromMonetizationToken: token });
      if (existingKey) {
        return renderKeyPage(res, existingKey.key, existingKey);
      }

      // ⚠️ ТРЕБУЕТ НАСТРОЙКИ: Проверьте документацию Linkvertise
      // Возможные варианты:
      // 1. Если есть API ключ (provider.config.useApiKey === true):
      //    const response = await fetch('https://api.linkvertise.com/api/v1/validate', {
      //      headers: { 'Authorization': `Bearer ${provider.config.apiKey}` },
      //      body: JSON.stringify({ token, user_id: provider.config.userId })
      //    });
      // 2. Linkvertise может отправлять параметр 'target' который содержит ваш callback
      // 3. Проверьте их документацию на https://linkvertise.com/pages/api
      
      // Временно принимаем token (замените на реальную валидацию!)
      console.log('⚠️ Linkvertise: Token validation not implemented. Check their API docs!');
      console.log('⚠️ Received params:', { token, userId, target });
      
      key = makeKey();
      const duration = provider.config?.keyDuration || 1;
      keyObj = {
        key,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + duration * 60 * 60 * 1000),
        isActive: true,
        usageCount: 0,
        maxUsage: null,
        source: providerId,
        fromMonetizationToken: token,
        provider: provider.name,
        hwid: null,
        robloxUserId: userId || null,
        robloxUsername: null,
      };
    } else {
      return res.status(400).send("Unsupported provider");
    }

    // Save key
    await keysCollection.insertOne(keyObj);
    await addEvent("created", key);
    
    // Update provider stats
    await monetizationProvidersCollection.updateOne(
      { id: providerId },
      { $inc: { 'stats.totalKeys': 1, 'stats.last30Days': 1 } }
    );
    
    await sendWebhook(`Key created (${provider.name})`, {
      key,
      provider: provider.name,
      expiresAt: keyObj.expiresAt.toISOString(),
    });

    return renderKeyPage(res, key, keyObj);
    
  } catch (error) {
    console.error(`${providerId} callback error:`, error);
    return res.status(500).send("Validation error");
  }
});

// Legacy endpoint for backwards compatibility
app.get("/workink-return", async (req, res) => {
  res.redirect(307, `/monetization-callback/workink?token=${req.query.token || ''}`);
});

app.get("/check", async (req, res) => {
  const { key, token, hwid, userId, username } = req.query;
  
  // Get user IP for geolocation
  const userIP = req.headers['x-forwarded-for']?.split(',')[0].trim() || 
                 req.headers['x-real-ip'] || 
                 req.connection.remoteAddress || 
                 req.socket.remoteAddress;
  
  // Save geo stats asynchronously (don't wait)
  saveGeoStat(userIP, 'check').catch(e => console.error('Geo stat error:', e));

  let realKey = key;
  if (!realKey && token) {
    const found = await keysCollection.findOne({ fromWorkInkToken: token });
    if (found) realKey = found.key;
  }

  let result = { valid: false, reason: "no_key" };

  if (!realKey) {
    await logsCollection.insertOne({
      at: new Date(),
      key: null,
      ok: false,
      reason: "no_key",
      hwid,
      userId,
      username,
    });
    return res.json(result);
  }

  const record = await keysCollection.findOne({ key: realKey });
  if (!record) {
    result = { valid: false, reason: "not_found" };
  } else if (!record.isActive) {
    result = { valid: false, reason: "inactive" };
  } else if (record.expiresAt && record.expiresAt < new Date()) {
    result = { valid: false, reason: "expired" };
  } else if (record.maxUsage && (record.usageCount || 0) >= record.maxUsage) {
    result = { valid: false, reason: "limit_reached" };
  } else {
    const updates = { $inc: { usageCount: 1 } };
    const setFields = {};
    if (hwid && !record.hwid) setFields.hwid = hwid;
    if (userId && !record.robloxUserId) {
      setFields.robloxUserId = userId;
      setFields.robloxUsername = username || null;
    }
    if (Object.keys(setFields).length > 0) {
      updates.$set = setFields;
    }
    await keysCollection.updateOne({ key: realKey }, updates);
    await addEvent("used", realKey);
    result = { valid: true };
  }

  await logsCollection.insertOne({
    at: new Date(),
    key: realKey,
    ok: result.valid,
    reason: result.reason,
    hwid,
    userId,
    username,
  });

  // Clean old logs (keep last 300)
  const count = await logsCollection.countDocuments();
  if (count > 300) {
    const oldLogs = await logsCollection.find().sort({ at: 1 }).limit(count - 300).toArray();
    if (oldLogs.length > 0) {
      await logsCollection.deleteMany({ _id: { $in: oldLogs.map(l => l._id) } });
    }
  }

  return res.json(result);
});

app.get("/admin", requireAdmin, async (req, res) => {
  const pass = req.query.pass;
  const page = req.query.page || "overview";
  const q = (req.query.q || "").toLowerCase();
  const filter = req.query.filter || "all";
  const rangeDays = Math.min(Math.max(parseInt(req.query.range || "30", 10), 1), 30);

  let query = {};

  if (filter === "active") {
    query = { 
      isActive: true,
      $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: { $gt: new Date() } }
      ]
    };
  } else if (filter === "expired") {
    query = { expiresAt: { $lt: new Date() } };
  } else if (filter === "workink") {
    query = { source: "workink" };
  } else if (filter === "admin") {
    query = { source: "admin" };
  }

  if (q) {
    const searchConditions = [
      { key: { $regex: q, $options: 'i' } },
      { robloxUsername: { $regex: q, $options: 'i' } },
    ];
    if (!isNaN(q)) {
      searchConditions.push({ robloxUserId: q });
    }
    if (query.$or) {
      query = { $and: [query, { $or: searchConditions }] };
    } else {
      query.$or = searchConditions;
    }
  }

  const list = await keysCollection.find(query).sort({ createdAt: -1 }).toArray();

  const clicks = await countTrafficInRange("getKey", rangeDays);
  const checkpoints = await countTrafficInRange("checkpoint", rangeDays);
  const keysGenerated = await countEventsInRange(rangeDays, "created");
  const keysUsed = await countEventsInRange(rangeDays, "used");
  const limitDate = new Date(Date.now() - rangeDays * 86400000);
  const scriptExecutions = await logsCollection.countDocuments({ at: { $gte: limitDate } });

  const totalKeys = await keysCollection.countDocuments();
  const totalChecks = await logsCollection.countDocuments();

  // ВАЖЛИВО: Генеруємо pageContent залежно від сторінки
  let pageContent = "";
  
  if (page === "keys") {
    pageContent = renderKeysPage(pass, rangeDays, q, filter, list);
  } else if (page === "checkpoints") {
    pageContent = await renderCheckpointsPage(pass);
  } else if (page === "scripts") {
    pageContent = await renderScriptsPage(pass, q);
  } else if (page === "monetization") {
    pageContent = await renderMonetizationPage(pass);
  } else if (page === "services") {
    pageContent = await renderServicesPage(pass);
  } else if (page === "webhooks") {
    pageContent = renderWebhooksPage(pass);
  } else if (page === "settings") {
    pageContent = await renderSettingsPage(pass);
  } else if (page === "analytics") {
    pageContent = await renderAnalyticsPage(pass);
  } else {
    // За замовчуванням: overview
    pageContent = await renderOverviewPage(pass, rangeDays, clicks, checkpoints, totalKeys, keysGenerated, keysUsed, scriptExecutions, totalChecks, list);
  }

  // Generate HTML
  res.send(`
  <!doctype html>
  <html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Dashboard - Key Management</title>
    <script src="https://cdn.tailwindcss.com"></script>
    
    <!-- CodeMirror для редактора кода -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/theme/dracula.min.css">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/lua/lua.min.js"></script>
    
    <style>
      @keyframes gradient {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
      body {
        background: linear-gradient(-45deg, #0f172a, #1e1b4b, #312e81, #1e293b);
        background-size: 400% 400%;
        animation: gradient 15s ease infinite;
      }
      .glass {
        background: rgba(15, 23, 42, 0.7);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(148, 163, 184, 0.1);
      }
      .sidebar-item {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem 1rem;
        border-radius: 0.75rem;
        color: rgba(148, 163, 184, 0.8);
        text-decoration: none;
        font-size: 0.875rem;
        transition: all 0.2s;
      }
      .sidebar-item:hover {
        background: rgba(59, 130, 246, 0.1);
        color: rgba(255, 255, 255, 0.9);
      }
      .sidebar-item.active {
        background: linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(147, 51, 234, 0.2));
        color: white;
        font-weight: 500;
      }
      .stat-card {
        background: rgba(15, 23, 42, 0.7);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(148, 163, 184, 0.1);
        border-radius: 1rem;
        padding: 1.25rem;
        transition: all 0.3s;
      }
      .stat-card:hover {
        transform: translateY(-2px);
        border-color: rgba(59, 130, 246, 0.3);
        box-shadow: 0 10px 30px rgba(59, 130, 246, 0.1);
      }
      .scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
      .scrollbar::-webkit-scrollbar-track { background: rgba(15, 23, 42, 0.4); border-radius: 10px; }
      .scrollbar::-webkit-scrollbar-thumb { background: rgba(59, 130, 246, 0.3); border-radius: 10px; }
      .scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(59, 130, 246, 0.5); }
      
      /* CodeMirror custom styles */
      .CodeMirror {
        height: 400px;
        font-family: 'Courier New', Consolas, monospace;
        font-size: 14px;
        line-height: 1.5;
      }
      .CodeMirror-gutters {
        background: #1e293b;
        border-right: 1px solid #334155;
      }
      .CodeMirror-linenumber {
        color: #64748b;
      }
      .CodeMirror-cursor {
        border-left: 2px solid #60a5fa !important;
      }
      .CodeMirror-selected {
        background: rgba(59, 130, 246, 0.2) !important;
      }
      .CodeMirror-activeline-background {
        background: rgba(59, 130, 246, 0.1) !important;
      }
    </style>
  </head>
  <body class="text-white min-h-screen flex">
    <!-- Sidebar -->
    <aside class="w-64 glass border-r border-slate-800/50 flex flex-col p-4 flex-shrink-0">
      <div class="flex items-center gap-3 mb-8 pb-4 border-b border-slate-800/50">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
          </svg>
        </div>
        <div>
          <p class="font-bold">Key Manager</p>
          <p class="text-xs text-slate-400">Admin Dashboard</p>
        </div>
      </div>
      
      <div class="text-xs uppercase tracking-wider text-slate-500 mb-3 px-2">Navigation</div>
      <div class="space-y-1 flex-1">
        <a href="/admin?pass=${pass}&page=overview" class="sidebar-item ${(!req.query.page || req.query.page === 'overview') ? 'active' : ''}">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
          </svg>
          Overview
        </a>
        <a href="/admin?pass=${pass}&page=keys" class="sidebar-item ${req.query.page === 'keys' ? 'active' : ''}">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
          </svg>
          Keys
        </a>
        <a href="/admin?pass=${pass}&page=checkpoints" class="sidebar-item ${req.query.page === 'checkpoints' ? 'active' : ''}">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
          </svg>
          Checkpoints
        </a>
        <a href="/admin?pass=${pass}&page=scripts" class="sidebar-item ${req.query.page === 'scripts' ? 'active' : ''}">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/>
          </svg>
          Scripts
        </a>
        <a href="/admin?pass=${pass}&page=monetization" class="sidebar-item ${req.query.page === 'monetization' ? 'active' : ''}">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          Monetization
        </a>
        <a href="/admin?pass=${pass}&page=services" class="sidebar-item ${req.query.page === 'services' ? 'active' : ''}">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
          </svg>
          Services
        </a>
        <a href="/admin?pass=${pass}&page=webhooks" class="sidebar-item ${req.query.page === 'webhooks' ? 'active' : ''}">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
          </svg>
          Webhooks
        </a>
        <a href="/admin?pass=${pass}&page=settings" class="sidebar-item ${req.query.page === 'settings' ? 'active' : ''}">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
          Settings
        </a>
        <a href="/admin?pass=${pass}&page=analytics" class="sidebar-item ${req.query.page === 'analytics' ? 'active' : ''}">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          Analytics
        </a>
      </div>
      
      <div class="pt-4 mt-auto border-t border-slate-800/50">
        <div class="flex items-center gap-3 px-2">
          <div class="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-blue-600 flex items-center justify-center text-xs font-bold">A</div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate">Admin</p>
            <p class="text-xs text-slate-500">Logged in</p>
          </div>
        </div>
      </div>
    </aside>

    <!-- Main Content -->
    <main class="flex-1 min-h-screen overflow-auto">
      ${pageContent}
    </main>
  </body>
  </html>
  `);
});

app.post("/admin/create-key", requireAdmin, async (req, res) => {
  const pass = req.body.pass || req.query.pass || ADMIN_PASSWORD;
  const customKey = (req.body.customKey || "").trim();
  const hours = Number(req.body.hours || 1);
  const maxUsage = req.body.maxUsage ? Number(req.body.maxUsage) : null;
  const robloxUserId = (req.body.robloxUserId || "").trim();
  const robloxUsername = (req.body.robloxUsername || "").trim();
  const hwid = (req.body.hwid || "").trim();

  const key = customKey !== "" ? customKey.toUpperCase() : makeKey();
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

  const keyObj = {
    key,
    createdAt: new Date(),
    expiresAt,
    isActive: true,
    usageCount: 0,
    maxUsage: maxUsage && maxUsage > 0 ? maxUsage : null,
    source: "admin",
    fromWorkInkToken: null,
    hwid: hwid !== "" ? hwid : null,
    robloxUserId: robloxUserId !== "" ? robloxUserId : null,
    robloxUsername: robloxUsername !== "" ? robloxUsername : null,
  };

  await keysCollection.insertOne(keyObj);
  await addEvent("created", key);
  await sendWebhook("Key created (admin)", {
    key,
    expiresAt: expiresAt.toISOString(),
    maxUsage: keyObj.maxUsage,
    robloxUserId,
    robloxUsername,
  });

  res.redirect("/admin?pass=" + encodeURIComponent(pass));
});

app.post("/admin/action", requireAdmin, async (req, res) => {
  const pass = req.body.pass || req.query.pass || ADMIN_PASSWORD;
  const { action, key } = req.body;
  const item = await keysCollection.findOne({ key });
  if (!item) {
    return res.redirect("/admin?pass=" + encodeURIComponent(pass));
  }

  if (action === "deactivate") {
    await keysCollection.updateOne({ key }, { $set: { isActive: false } });
  } else if (action === "delete") {
    await keysCollection.deleteOne({ key });
  } else if (action === "extend1h") {
    const base = item.expiresAt && item.expiresAt > new Date() ? item.expiresAt : new Date();
    const newExpiry = new Date(base.getTime() + 1 * 60 * 60 * 1000);
    await keysCollection.updateOne({ key }, { $set: { expiresAt: newExpiry } });
  } else if (action === "extend24h") {
    const base = item.expiresAt && item.expiresAt > new Date() ? item.expiresAt : new Date();
    const newExpiry = new Date(base.getTime() + 24 * 60 * 60 * 1000);
    await keysCollection.updateOne({ key }, { $set: { expiresAt: newExpiry } });
  }

  res.redirect("/admin?pass=" + encodeURIComponent(pass));
});

app.get("/admin/delete-expired", requireAdmin, async (req, res) => {
  const pass = req.query.pass || ADMIN_PASSWORD;
  const now = new Date();
  await keysCollection.deleteMany({ expiresAt: { $lt: now } });
  res.redirect("/admin?pass=" + encodeURIComponent(pass));
});

app.post("/admin/clear-logs", requireAdmin, async (req, res) => {
  const pass = req.body.pass || ADMIN_PASSWORD;
  await logsCollection.deleteMany({});
  res.redirect("/admin?pass=" + encodeURIComponent(pass));
});

app.post("/admin/clear-all", requireAdmin, async (req, res) => {
  const pass = req.body.pass || ADMIN_PASSWORD;
  await keysCollection.deleteMany({});
  await logsCollection.deleteMany({});
  await eventsCollection.deleteMany({});
  await trafficCollection.deleteMany({});
  res.redirect("/admin?pass=" + encodeURIComponent(pass));
});

// Save settings
app.post("/admin/settings/save", requireAdmin, async (req, res) => {
  try {
    const { youtubeChannel, discordWebhook } = req.body;
    
    await settingsCollection.updateOne(
      { _id: "global" },
      {
        $set: {
          youtubeChannel: youtubeChannel || "",
          discordWebhook: discordWebhook || "",
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );
    
    res.json({ success: true });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.post("/admin/test-webhook", requireAdmin, async (req, res) => {
  const pass = req.body.pass || ADMIN_PASSWORD;
  const message = req.body.message || "Test notification from admin panel";
  await sendWebhook("Test Webhook", { message, timestamp: new Date().toISOString() });
  res.redirect("/admin?pass=" + encodeURIComponent(pass) + "&page=webhooks");
});

// ===================== CHECKPOINT MANAGEMENT =====================

app.post("/admin/checkpoint-create", requireAdmin, async (req, res) => {
  const pass = req.body.pass || ADMIN_PASSWORD;
  const { name, description, type, url, waitTime, enabled, groupId, groupName, groupMode } = req.body;
  
  const maxOrder = await checkpointsCollection.find().sort({ order: -1 }).limit(1).toArray();
  const nextOrder = maxOrder.length > 0 ? maxOrder[0].order + 1 : 1;
  
  await checkpointsCollection.insertOne({
    name,
    description,
    type,
    url,
    waitTime: parseInt(waitTime) || 10,
    order: nextOrder,
    groupId: groupId || null,
    groupName: groupName || null,
    groupMode: groupMode || null,
    enabled: enabled === 'on',
    createdAt: new Date()
  });
  
  res.redirect("/admin?pass=" + encodeURIComponent(pass) + "&page=checkpoints");
});

app.post("/admin/checkpoint-update", requireAdmin, async (req, res) => {
  const pass = req.body.pass || ADMIN_PASSWORD;
  const { id, name, description, type, url, waitTime, enabled } = req.body;
  const { ObjectId } = await import('mongodb');
  
  await checkpointsCollection.updateOne(
    { _id: new ObjectId(id) },
    {
      $set: {
        name,
        description,
        type,
        url,
        waitTime: parseInt(waitTime) || 10,
        enabled: enabled === 'on',
        updatedAt: new Date()
      }
    }
  );
  
  res.redirect("/admin?pass=" + encodeURIComponent(pass) + "&page=checkpoints");
});

app.post("/admin/checkpoint-delete", requireAdmin, async (req, res) => {
  const pass = req.body.pass || ADMIN_PASSWORD;
  const { id } = req.body;
  const { ObjectId } = await import('mongodb');
  
  await checkpointsCollection.deleteOne({ _id: new ObjectId(id) });
  
  res.redirect("/admin?pass=" + encodeURIComponent(pass) + "&page=checkpoints");
});

app.post("/admin/checkpoint-toggle", requireAdmin, async (req, res) => {
  const pass = req.body.pass || ADMIN_PASSWORD;
  const { id } = req.body;
  const { ObjectId } = await import('mongodb');
  
  const checkpoint = await checkpointsCollection.findOne({ _id: new ObjectId(id) });
  if (checkpoint) {
    await checkpointsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { enabled: !checkpoint.enabled } }
    );
  }
  
  res.redirect("/admin?pass=" + encodeURIComponent(pass) + "&page=checkpoints");
});

app.post("/admin/checkpoint-reorder", requireAdmin, async (req, res) => {
  const { order } = req.body;
  const { ObjectId } = await import('mongodb');
  
  // Update order for each checkpoint
  for (let i = 0; i < order.length; i++) {
    await checkpointsCollection.updateOne(
      { _id: new ObjectId(order[i]) },
      { $set: { order: i + 1 } }
    );
  }
  
  res.json({ success: true });
});

app.post("/admin/checkpoint-delete-group", requireAdmin, async (req, res) => {
  const pass = req.body.pass || ADMIN_PASSWORD;
  const { groupId } = req.body;
  
  // Delete all checkpoints in the group
  await checkpointsCollection.deleteMany({ groupId });
  
  res.redirect("/admin?pass=" + encodeURIComponent(pass) + "&page=checkpoints");
});

// ===================== MONETIZATION MANAGEMENT =====================

app.post("/admin/monetization-update", requireAdmin, async (req, res) => {
  const pass = req.body.pass || ADMIN_PASSWORD;
  const { providerId, linkUrl, keyDuration, apiKey, userId, useApiKey } = req.body;
  
  const updateData = {
    'config.linkUrl': linkUrl,
    'config.keyDuration': parseInt(keyDuration) || 1,
    'config.useApiKey': useApiKey === 'on'
  };
  
  // Save API key for Work.ink
  if (apiKey !== undefined) {
    updateData['config.apiKey'] = apiKey;
  }
  
  // Save userId for Linkvertise
  if (userId !== undefined) {
    updateData['config.userId'] = userId;
  }
  
  await monetizationProvidersCollection.updateOne(
    { id: providerId },
    { 
      $set: { ...updateData, enabled: true, updatedAt: new Date() }
    }
  );
  
  res.redirect("/admin?pass=" + encodeURIComponent(pass) + "&page=monetization");
});

app.post("/admin/monetization-set-active", requireAdmin, async (req, res) => {
  const pass = req.body.pass || ADMIN_PASSWORD;
  const { providerId } = req.body;
  
  // Deactivate all providers
  await monetizationProvidersCollection.updateMany({}, { $set: { isActive: false } });
  
  // Activate selected provider
  await monetizationProvidersCollection.updateOne(
    { id: providerId },
    { $set: { isActive: true, enabled: true } }
  );
  
  res.redirect("/admin?pass=" + encodeURIComponent(pass) + "&page=monetization");
});

// ===================== SERVICES MANAGEMENT =====================

app.post("/admin/update-services", requireAdmin, async (req, res) => {
  const pass = req.body.pass || ADMIN_PASSWORD;
  // For now, just redirect back. In production, you'd update environment variables or a config file
  res.redirect("/admin?pass=" + encodeURIComponent(pass) + "&page=services");
});

app.post("/admin/update-key-settings", requireAdmin, async (req, res) => {
  const pass = req.body.pass || ADMIN_PASSWORD;
  // For now, just redirect back. In production, you'd update settings in database
  res.redirect("/admin?pass=" + encodeURIComponent(pass) + "&page=services");
});

function renderKeyPage(res, key, keyData) {
  const expired = keyData.expiresAt && keyData.expiresAt < new Date();
  const created =
    keyData.createdAt && keyData.createdAt.toISOString
      ? keyData.createdAt.toISOString().replace("T", " ").slice(0, 19)
      : "—";
  const exp =
    keyData.expiresAt && keyData.expiresAt.toISOString
      ? keyData.expiresAt.toISOString().replace("T", " ").slice(0, 19)
      : "—";

  res.send(`
  <!doctype html><html><head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Your Key</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
      @keyframes gradient {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
      }
      body {
        background: linear-gradient(-45deg, #0f172a, #1e1b4b, #312e81, #1e293b);
        background-size: 400% 400%;
        animation: gradient 15s ease infinite;
      }
      .glass {
        background: rgba(15, 23, 42, 0.7);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(148, 163, 184, 0.1);
      }
      @keyframes slideIn {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      .slide-in {
        animation: slideIn 0.6s ease-out;
      }
      @keyframes float {
        0%, 100% { transform: translateY(0px); }
        50% { transform: translateY(-10px); }
      }
      .float {
        animation: float 3s ease-in-out infinite;
      }
    </style>
  </head><body class="flex items-center justify-center min-h-screen p-4 text-white">
    <div class="max-w-2xl w-full space-y-6 slide-in">
      <!-- Success Badge -->
      <div class="text-center">
        <div class="inline-flex items-center justify-center w-20 h-20 rounded-2xl ${expired ? "bg-gradient-to-br from-rose-500 to-pink-600 shadow-2xl shadow-rose-500/40" : "bg-gradient-to-br from-emerald-500 to-blue-600 shadow-2xl shadow-emerald-500/40"} mb-4 float">
          <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            ${expired 
              ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>'
              : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>'}
          </svg>
        </div>
        <h1 class="text-3xl font-bold mb-2">${expired ? "Key Expired" : "Success!"}</h1>
        <p class="text-slate-400">${expired ? "This key has expired but has been generated" : "Your access key has been generated successfully"}</p>
      </div>

      <!-- Status Card -->
      <div class="glass rounded-2xl p-6 shadow-2xl">
        <div class="flex items-center justify-between mb-6">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-xl ${expired ? "bg-rose-500/10" : "bg-emerald-500/10"} flex items-center justify-center">
              <svg class="w-6 h-6 ${expired ? "text-rose-400" : "text-emerald-400"}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
              </svg>
            </div>
            <div>
              <h2 class="text-lg font-semibold">Your Access Key</h2>
              <p class="text-sm text-slate-400">Copy and use in your application</p>
            </div>
          </div>
          <span class="px-3 py-1.5 rounded-full text-xs font-medium ${expired ? "bg-rose-500/10 text-rose-300 border border-rose-500/20" : "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"}">
            ${expired ? "Expired" : "Active"}
          </span>
        </div>

        <!-- Key Display -->
        <div class="space-y-4">
          <div>
            <label class="block text-xs text-slate-400 mb-2 uppercase tracking-wider">Your Key Code</label>
            <div class="flex gap-3">
              <div class="flex-1 glass rounded-xl px-5 py-4 border ${expired ? "border-rose-400/20" : "border-emerald-400/20"}">
                <code class="text-2xl font-mono font-bold tracking-wider ${expired ? "text-rose-300" : "text-emerald-300"}">${key}</code>
              </div>
              <button onclick="copyKey()" class="px-5 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 font-medium transition-all transform hover:scale-105 active:scale-95 shadow-lg shadow-blue-500/30">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- Details Grid -->
          <div class="grid grid-cols-3 gap-3">
            <div class="glass rounded-xl p-4 border border-slate-700/50">
              <div class="flex items-center gap-2 mb-2">
                <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <span class="text-xs text-slate-400 uppercase tracking-wider">Created</span>
              </div>
              <p class="text-sm font-medium text-slate-200">${created}</p>
            </div>
            
            <div class="glass rounded-xl p-4 border border-slate-700/50">
              <div class="flex items-center gap-2 mb-2">
                <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                </svg>
                <span class="text-xs text-slate-400 uppercase tracking-wider">Expires</span>
              </div>
              <p class="text-sm font-medium ${expired ? "text-rose-300" : "text-slate-200"}">${exp}</p>
            </div>
            
            <div class="glass rounded-xl p-4 border border-slate-700/50">
              <div class="flex items-center gap-2 mb-2">
                <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <span class="text-xs text-slate-400 uppercase tracking-wider">Status</span>
              </div>
              <p class="text-sm font-medium ${expired ? "text-rose-300" : "text-emerald-300"}">${expired ? "Expired" : "Valid"}</p>
            </div>
          </div>
        </div>

        ${expired ? `
        <div class="mt-4 flex items-start gap-3 bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
          <svg class="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
          <div>
            <p class="text-sm font-medium text-amber-300 mb-1">Key Expired</p>
            <p class="text-xs text-slate-400">This key has expired and cannot be used. Please generate a new one.</p>
          </div>
        </div>
        ` : `
        <div class="mt-4 flex items-start gap-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
          <svg class="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <div>
            <p class="text-sm font-medium text-emerald-300 mb-1">Key is Active</p>
            <p class="text-xs text-slate-400">Your key is ready to use. Keep it safe and don't share it with others.</p>
          </div>
        </div>
        `}
      </div>

      <!-- Footer -->
      <div class="text-center">
        <p class="text-slate-500 text-sm">🔒 Keep your key secure and private</p>
      </div>
    </div>

    <script>
      function copyKey() {
        navigator.clipboard.writeText('${key}').then(() => {
          const btn = event.target.closest('button');
          const originalHTML = btn.innerHTML;
          btn.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>';
          btn.classList.add('bg-emerald-500', 'hover:bg-emerald-600');
          btn.classList.remove('from-blue-500', 'to-purple-600', 'hover:from-blue-600', 'hover:to-purple-700');
          setTimeout(() => {
            btn.innerHTML = originalHTML;
            btn.classList.remove('bg-emerald-500', 'hover:bg-emerald-600');
            btn.classList.add('bg-gradient-to-r', 'from-blue-500', 'to-purple-600', 'hover:from-blue-600', 'hover:to-purple-700');
          }, 2000);
        });
      }
    </script>
  </body></html>
  `);
}

// ===================== SCRIPTS API =====================

// Get script by ID (for editing)
app.get("/admin/scripts/get", requireAdmin, async (req, res) => {
  const id = req.query.id;
  try {
    const { ObjectId } = await import("mongodb");
    const script = await scriptsCollection.findOne({ _id: new ObjectId(id) });
    if (!script) {
      return res.status(404).json({ error: "Script not found" });
    }
    res.json(script);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add new script
app.post("/admin/scripts/add", requireAdmin, async (req, res) => {
  const { name, slug, description, content, enabled, obfuscated, requireKey } = req.body;
  
  try {
    // Check if slug already exists
    const existing = await scriptsCollection.findOne({ slug });
    if (existing) {
      return res.status(400).send("Slug already exists");
    }
    
    // Process content: Key System → Obfuscation
    let processedContent = content;
    
    // 1. Wrap with Key System if requested (HIDDEN from user)
    if (requireKey === true) {
      processedContent = wrapWithKeySystem(processedContent, BASE_URL);
    }
    
    // 2. Apply obfuscation if requested
    if (obfuscated === true) {
      processedContent = obfuscateLua(processedContent);
    }
    
    const script = {
      name,
      slug,
      description: description || "",
      enabled: enabled === true,
      obfuscated: obfuscated === true,
      requireKey: requireKey === true, // NEW: track if key system is required
      versions: [
        {
          version: 1,
          content: processedContent, // Final code (with key system + obfuscation)
          rawContent: content,       // Original user code (WITHOUT key system)
          createdAt: new Date(),
          createdBy: "admin"
        }
      ],
      analytics: {
        totalDownloads: 0,
        lastAccessed: null
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    await scriptsCollection.insertOne(script);
    res.json({ success: true, id: script._id });
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Edit script
app.post("/admin/scripts/edit", requireAdmin, async (req, res) => {
  const { id, name, slug, description, content, enabled, obfuscated, requireKey } = req.body;
  
  try {
    const { ObjectId } = await import("mongodb");
    const existing = await scriptsCollection.findOne({ _id: new ObjectId(id) });
    if (!existing) {
      return res.status(404).send("Script not found");
    }
    
    // Check if slug changed and new slug exists
    if (slug !== existing.slug) {
      const slugExists = await scriptsCollection.findOne({ slug, _id: { $ne: new ObjectId(id) } });
      if (slugExists) {
        return res.status(400).send("Slug already exists");
      }
    }
    
    // Check if content changed
    const currentVersion = existing.versions[existing.versions.length - 1];
    const contentChanged = content !== currentVersion.rawContent;
    
    // Process content: Key System → Obfuscation
    let processedContent = content;
    
    // 1. Wrap with Key System if requested
    if (requireKey === true) {
      processedContent = wrapWithKeySystem(processedContent, BASE_URL);
    }
    
    // 2. Apply obfuscation if requested
    if (obfuscated === true) {
      processedContent = obfuscateLua(processedContent);
    }
    
    // Create new version if content changed OR if settings changed
    const newVersions = [...existing.versions];
    const settingsChanged = obfuscated !== existing.obfuscated || requireKey !== existing.requireKey;
    
    if (contentChanged || settingsChanged) {
      newVersions.push({
        version: existing.versions.length + 1,
        content: processedContent,     // Final code (with key system + obfuscation)
        rawContent: content,            // Original user code
        createdAt: new Date(),
        createdBy: "admin"
      });
    }
    
    await scriptsCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          name,
          slug,
          description: description || "",
          enabled: enabled === true,
          obfuscated: obfuscated === true,
          requireKey: requireKey === true,  // NEW: update key system setting
          versions: newVersions,
          updatedAt: new Date()
        }
      }
    );
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Delete script
app.post("/admin/scripts/delete", requireAdmin, async (req, res) => {
  const { id } = req.body;
  
  try {
    const { ObjectId } = await import("mongodb");
    const result = await scriptsCollection.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return res.status(404).send("Script not found");
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// Public endpoint: Get script for loadstring
app.get("/script/:slug", async (req, res) => {
  const { slug } = req.params;
  
  // Check if request is from browser (block only browsers, allow all executors)
  const userAgent = req.headers['user-agent'] || '';
  const isBrowser = userAgent.includes('Mozilla') && (
                    userAgent.includes('Chrome') || 
                    userAgent.includes('Safari') || 
                    userAgent.includes('Edge') || 
                    userAgent.includes('Firefox') ||
                    userAgent.includes('Opera'));
  
  if (isBrowser) {
    // Return HTML page with access denied message
    return res.status(403).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Access Denied</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(-45deg, #0f172a, #1e1b4b, #312e81, #1e293b);
            background-size: 400% 400%;
            animation: gradient 15s ease infinite;
            color: white;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
          }
          @keyframes gradient {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
          .container {
            max-width: 600px;
            text-align: center;
            background: rgba(15, 23, 42, 0.7);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(148, 163, 184, 0.1);
            border-radius: 20px;
            padding: 60px 40px;
          }
          .icon {
            width: 100px;
            height: 100px;
            margin: 0 auto 30px;
            background: rgba(239, 68, 68, 0.1);
            border: 2px solid rgba(239, 68, 68, 0.3);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 48px;
          }
          h1 {
            font-size: 32px;
            margin-bottom: 16px;
            background: linear-gradient(135deg, #ef4444, #dc2626);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }
          p {
            color: rgba(255, 255, 255, 0.7);
            font-size: 16px;
            line-height: 1.6;
            margin-bottom: 30px;
          }
          .code {
            background: rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(148, 163, 184, 0.2);
            border-radius: 8px;
            padding: 16px;
            font-family: 'Courier New', monospace;
            font-size: 14px;
            color: #10b981;
            margin: 20px 0;
            word-break: break-all;
          }
          .info {
            font-size: 14px;
            color: rgba(255, 255, 255, 0.5);
            margin-top: 20px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">🔒</div>
          <h1>Access Denied</h1>
          <p>У вас нет доступа к этому скрипту</p>
          <p style="font-size: 14px; color: rgba(255, 255, 255, 0.6);">
            Этот endpoint предназначен только для использования внутри Roblox через <code style="color: #60a5fa;">loadstring()</code>
          </p>
          <div class="code">
            loadstring(game:HttpGet("${req.protocol}://${req.get('host')}${req.originalUrl}"))()
          </div>
          <div class="info">
            Используйте этот код в Roblox executor
          </div>
        </div>
      </body>
      </html>
    `);
  }
  
  try {
    const script = await scriptsCollection.findOne({ slug, enabled: true });
    if (!script) {
      return res.status(404).send("-- Script not found or disabled");
    }
    
    // Get latest version
    const latestVersion = script.versions[script.versions.length - 1];
    
    // Update analytics
    await scriptsCollection.updateOne(
      { _id: script._id },
      {
        $inc: { "analytics.totalDownloads": 1 },
        $set: { "analytics.lastAccessed": new Date() }
      }
    );
    
    // Return Lua script
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.send(latestVersion.content);
  } catch (error) {
    res.status(500).send("-- Error: " + error.message);
  }
});

// Key System wrapper function
function wrapWithKeySystem(code, serverUrl) {
  const keySystemCode = `-- 🔐 KEY SYSTEM PROTECTION
-- This code is automatically added and hidden from editor
local KEY_BACKEND = "${serverUrl}"

local function getHWID()
    local ok, id = pcall(function()
        return game:GetService("RbxAnalyticsService"):GetClientId()
    end)
    if ok and id then return id end
    if typeof(gethwid) == "function" then
        local ok2, hw = pcall(gethwid)
        if ok2 and hw then return hw end
    end
    return tostring(game.Players.LocalPlayer.UserId) .. "-" .. game.Players.LocalPlayer.Name
end

local function validateKey(userKey)
    if not userKey or userKey == "" then return false, "Key is empty" end
    local HttpService = game:GetService("HttpService")
    local LocalPlayer = game.Players.LocalPlayer
    local hwid = getHWID()
    
    local url = string.format(
        "%s/check?key=%s&hwid=%s&userId=%s&username=%s",
        KEY_BACKEND,
        HttpService:UrlEncode(userKey),
        HttpService:UrlEncode(hwid),
        HttpService:UrlEncode(tostring(LocalPlayer.UserId)),
        HttpService:UrlEncode(LocalPlayer.Name)
    )
    
    local req = (syn and syn.request) or http_request or request
    local status, body = 0, nil
    if req then
        local ok, res = pcall(function() return req({Url=url,Method="GET"}) end)
        if ok and res then
            status = res.StatusCode or res.Status or 0
            body = res.Body or res.body
        end
    else
        local ok2, body2 = pcall(game.HttpGet, game, url)
        if ok2 then status, body = 200, body2 end
    end
    
    if status ~= 200 or not body then return false, "Server error" end
    
    local ok, data = pcall(function() return HttpService:JSONDecode(body) end)
    if not ok or not data then return false, "Invalid response" end
    
    if data.valid == true then return true, "Valid" end
    return false, tostring(data.reason or "Invalid key")
end

local function createKeyUI(callback)
    local ScreenGui = Instance.new("ScreenGui")
    ScreenGui.Name = "KeySystem"
    ScreenGui.ResetOnSpawn = false
    ScreenGui.Parent = game:GetService("CoreGui")
    
    local Blur = Instance.new("BlurEffect")
    Blur.Size = 10
    Blur.Parent = game:GetService("Lighting")
    
    local Frame = Instance.new("Frame")
    Frame.AnchorPoint = Vector2.new(0.5, 0.5)
    Frame.Position = UDim2.new(0.5, 0, 0.5, 0)
    Frame.Size = UDim2.new(0, 400, 0, 250)
    Frame.BackgroundColor3 = Color3.fromRGB(20, 20, 30)
    Frame.BorderSizePixel = 0
    Frame.Parent = ScreenGui
    
    local Corner = Instance.new("UICorner")
    Corner.CornerRadius = UDim.new(0, 12)
    Corner.Parent = Frame
    
    local Title = Instance.new("TextLabel")
    Title.Size = UDim2.new(1, 0, 0, 50)
    Title.BackgroundColor3 = Color3.fromRGB(30, 30, 45)
    Title.BorderSizePixel = 0
    Title.Text = "🔑 KEY SYSTEM"
    Title.TextColor3 = Color3.fromRGB(255, 255, 255)
    Title.TextSize = 20
    Title.Font = Enum.Font.GothamBold
    Title.Parent = Frame
    
    local TitleCorner = Instance.new("UICorner")
    TitleCorner.CornerRadius = UDim.new(0, 12)
    TitleCorner.Parent = Title
    
    local Cover = Instance.new("Frame")
    Cover.Position = UDim2.new(0, 0, 1, -12)
    Cover.Size = UDim2.new(1, 0, 0, 12)
    Cover.BackgroundColor3 = Color3.fromRGB(30, 30, 45)
    Cover.BorderSizePixel = 0
    Cover.Parent = Title
    
    local Input = Instance.new("TextBox")
    Input.Position = UDim2.new(0, 20, 0, 70)
    Input.Size = UDim2.new(1, -40, 0, 40)
    Input.BackgroundColor3 = Color3.fromRGB(30, 30, 45)
    Input.BorderSizePixel = 0
    Input.Text = ""
    Input.PlaceholderText = "Enter key..."
    Input.TextColor3 = Color3.fromRGB(255, 255, 255)
    Input.PlaceholderColor3 = Color3.fromRGB(100, 100, 120)
    Input.TextSize = 14
    Input.Font = Enum.Font.Gotham
    Input.Parent = Frame
    
    local InputCorner = Instance.new("UICorner")
    InputCorner.CornerRadius = UDim.new(0, 8)
    InputCorner.Parent = Input
    
    local GetKey = Instance.new("TextButton")
    GetKey.Position = UDim2.new(0, 20, 0, 125)
    GetKey.Size = UDim2.new(0.47, 0, 0, 40)
    GetKey.BackgroundColor3 = Color3.fromRGB(80, 120, 255)
    GetKey.BorderSizePixel = 0
    GetKey.Text = "Get Key"
    GetKey.TextColor3 = Color3.fromRGB(255, 255, 255)
    GetKey.TextSize = 14
    GetKey.Font = Enum.Font.GothamBold
    GetKey.Parent = Frame
    
    local GetKeyCorner = Instance.new("UICorner")
    GetKeyCorner.CornerRadius = UDim.new(0, 8)
    GetKeyCorner.Parent = GetKey
    
    local Verify = Instance.new("TextButton")
    Verify.Position = UDim2.new(0.53, 0, 0, 125)
    Verify.Size = UDim2.new(0.47, 0, 0, 40)
    Verify.BackgroundColor3 = Color3.fromRGB(50, 200, 100)
    Verify.BorderSizePixel = 0
    Verify.Text = "Verify"
    Verify.TextColor3 = Color3.fromRGB(255, 255, 255)
    Verify.TextSize = 14
    Verify.Font = Enum.Font.GothamBold
    Verify.Parent = Frame
    
    local VerifyCorner = Instance.new("UICorner")
    VerifyCorner.CornerRadius = UDim.new(0, 8)
    VerifyCorner.Parent = Verify
    
    local Status = Instance.new("TextLabel")
    Status.Position = UDim2.new(0, 20, 0, 180)
    Status.Size = UDim2.new(1, -40, 0, 50)
    Status.BackgroundTransparency = 1
    Status.Text = "Click 'Get Key' to copy link"
    Status.TextColor3 = Color3.fromRGB(150, 150, 170)
    Status.TextSize = 12
    Status.Font = Enum.Font.Gotham
    Status.TextWrapped = true
    Status.Parent = Frame
    
    GetKey.MouseButton1Click:Connect(function()
        local link = KEY_BACKEND .. "/get-key"
        if setclipboard then
            pcall(function() setclipboard(link) end)
            Status.Text = "✓ Link copied!"
            Status.TextColor3 = Color3.fromRGB(50, 200, 100)
        elseif toclipboard then
            pcall(function() toclipboard(link) end)
            Status.Text = "✓ Link copied!"
            Status.TextColor3 = Color3.fromRGB(50, 200, 100)
        else
            Status.Text = "Open: " .. link
            Status.TextColor3 = Color3.fromRGB(100, 150, 255)
        end
    end)
    
    Verify.MouseButton1Click:Connect(function()
        local key = Input.Text
        if key == "" then
            Status.Text = "❌ Enter a key first"
            Status.TextColor3 = Color3.fromRGB(255, 100, 100)
            return
        end
        
        Status.Text = "⏳ Checking..."
        Status.TextColor3 = Color3.fromRGB(150, 150, 170)
        Verify.Text = "..."
        
        task.spawn(function()
            local success, message = validateKey(key)
            task.wait(0.5)
            
            if success then
                Status.Text = "✅ Key valid!"
                Status.TextColor3 = Color3.fromRGB(50, 200, 100)
                task.wait(1)
                ScreenGui:Destroy()
                Blur:Destroy()
                callback()
            else
                Status.Text = "❌ " .. message
                Status.TextColor3 = Color3.fromRGB(255, 100, 100)
                Verify.Text = "Verify"
            end
        end)
    end)
end

-- Execute with key check
createKeyUI(function()
${code.split('\n').map(line => '    ' + line).join('\n')}
end)
`;
  
  return keySystemCode;
}

// Advanced Lua obfuscation function
function obfuscateLua(code) {
  // Simple and reliable obfuscation using loadstring
  // Remove comments to reduce size
  code = code.replace(/--\[\[[\s\S]*?\]\]/g, '');
  code = code.replace(/--[^\n]*/g, '');
  
  // Escape special characters for Lua string
  const escaped = code
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
  
  // Simple wrapper with loadstring
  const obfuscated = `-- Protected Script
return (function()
    local _=(loadstring or load)("${escaped}")
    if _ then
        return _()
    else
        error("Failed to load script")
    end
end)()`;
  
  return obfuscated;
}

const PORT = process.env.PORT || 3000;

// Connect to MongoDB and start server
connectDB().then(() => {
app.listen(PORT, () => {
    console.log("🚀 Server started on port " + PORT);
    console.log("📊 MongoDB database: key_management");
  });
}).catch(error => {
  console.error("Failed to start server:", error);
  process.exit(1);
});

