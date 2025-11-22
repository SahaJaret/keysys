
-- 🔥 ENVIRONMENT ACCESS: JunkieCore is provided by Loader environment
-- Initialize JunkieProtected with config (from environment JunkieCore, not _G)

-- Debug: Check if JunkieCore is available
if not JunkieCore then
    error("JunkieCore not available in environment! Check Loader setup.", 0)
end

local config = {
    api_key = "API_KEY_PLACEHOLDER",
    provider = "Mixed",
    service = "Default",
    hash = "05133e4e567a5e49b8b07bccb0ac3a01"
}

-- Initialize JunkieProtected (using JunkieCore from environment)
local JunkieProtected = JunkieCore.initialize(config)
config = nil

local function _uskfurGeYE()
    -- 🌀 Load WindUI ONCE
    local WindUI = loadstring(game:HttpGet("https://raw.githubusercontent.com/Footagesus/WindUI/main/dist/main.lua"))()
    if not WindUI then return end
    
    ------------------------------------------------------------
    -- 🔑 BACKEND (Render)
    ------------------------------------------------------------
    -- твой сайт на render
    local KEY_BACKEND = "https://keys-7ngi.onrender.com"  -- без / в конце
    
    ------------------------------------------------------------
    -- 🔧 HTTP / ID helpers (с фиксом Bad response)
    ------------------------------------------------------------
    local HttpService = game:GetService("HttpService")
    local Players     = game:GetService("Players")
    local LocalPlayer = Players.LocalPlayer
    
    -- нормальный HWID
    local function getHWID()
        local ok, id = pcall(function()
            return game:GetService("RbxAnalyticsService"):GetClientId()
        end)
        if ok and id then return id end
    
        if typeof(gethwid) == "function" then
            local ok2, hw = pcall(gethwid)
            if ok2 and hw then return hw end
        end
    
        return tostring(LocalPlayer.UserId) .. "-" .. LocalPlayer.Name
    end
    
    -- общий GET: возвращает status, body
    local function httpGET_raw(url)
        -- если кто-то случайно поставил http://, попробуем https://
        if string.sub(url, 1, 7) == "http://" then
            url = "https://" .. string.sub(url, 8)
        end
    
        -- сначала пытаемся через syn / http_request
        local req = (syn and syn.request) or http_request or request
        if req then
            local ok, res = pcall(function()
                return req({
                    Url = url,
                    Method = "GET",
                })
            end)
            if ok and res then
                local code = tonumber(res.StatusCode or res.Status or 0)
                local body = res.Body or res.body or ""
                -- если сервер ответил редиректом — пройдём за ним 1 раз
                local headers = res.Headers or res.headers
                if (code == 301 or code == 302 or code == 307 or code == 308) and headers then
                    local loc = headers.Location or headers.location
                    if loc and loc ~= "" then
                        return httpGET_raw(loc)
                    end
                end
                return code, tostring(body)
            end
        end
    
        -- fallback через Roblox
        local ok2, body2 = pcall(game.HttpGet, game, url)
        if ok2 then
            return 200, tostring(body2)
        end
    
        return 0, nil
    end
    
    -- безопасный JSONDecode
    local function tryJSONDecode(s)
        if not s or s == "" then
            return false, nil
        end
        local ok, data = pcall(function()
            return HttpService:JSONDecode(s)
        end)
        if ok then
            return true, data
        end
        return false, nil
    end
    
    ------------------------------------------------------------
    -- 🧩 Кастомный сервис для WindUI
    ------------------------------------------------------------
    WindUI.Services.vezunthub = {
        Name = "Vezunt Key",
        Icon = "key",
        Args = { "BaseUrl" },
    
        New = function(BaseUrl)
            BaseUrl = BaseUrl or KEY_BACKEND
    
            -- 🟣 проверка ключа (то, что раньше писало Bad response)
            local function validateKey(userKey)
                if not userKey or userKey == "" then
                    return false, "Key is empty"
                end
    
                -- нормализуем базу
                if string.sub(BaseUrl, 1, 7) == "http://" then
                    BaseUrl = "https://" .. string.sub(BaseUrl, 8)
                end
    
                local hwid = getHWID()
                local url = string.format(
                    "%s/check?key=%s&hwid=%s&userId=%s&username=%s",
                    BaseUrl,
                    HttpService:UrlEncode(userKey),
                    HttpService:UrlEncode(hwid),
                    HttpService:UrlEncode(tostring(LocalPlayer.UserId)),
                    HttpService:UrlEncode(LocalPlayer.Name)
                )
    
                local status, body = httpGET_raw(url)
                if status ~= 200 or not body then
                    return false, "Server error (" .. tostring(status) .. ")"
                end
    
                local ok, data = tryJSONDecode(body)
                if not ok or not data then
                    -- покажем кусок ответа, чтобы понимать что вернул сервер
                    local preview = string.sub(tostring(body), 1, 80)
                    return false, "Bad response: " .. preview
                end
    
                if data.valid == true then
                    return true, "Key is valid"
                else
                    return false, "Invalid: " .. tostring(data.reason or "unknown")
                end
            end
    
            -- 🟣 копирование ссылки на /get-key
            local function copyLink()
                -- сначала быстрая
                local fast = BaseUrl .. "/get-key"
    
                -- пробуем получить актуальную через /gate
                local status, body = httpGET_raw(BaseUrl .. "/gate")
                if status == 200 and body then
                    local ok, data = tryJSONDecode(body)
                    if ok and data and data.url then
                        fast = data.url
                    end
                end
    
                local copied = false
                local function tryCopy(fn)
                    local okc = pcall(fn, fast)
                    if okc then copied = true end
                end
    
                if setclipboard then
                    tryCopy(setclipboard)
                elseif toclipboard then
                    tryCopy(toclipboard)
                elseif syn and syn.write_clipboard then
                    tryCopy(syn.write_clipboard)
                end
    
                return true, copied and "Link copied" or ("Open: " .. fast)
            end
    
            return {
                Verify = validateKey,
                Copy   = copyLink,
            }
        end
    }
    
    ------------------------------------------------------------
    -- 💬 Welcome popup
    ------------------------------------------------------------
    WindUI:Popup({
        Title = "VezuntHUB loaded",
        Icon = "bird",
        Content = "Press P to show/hide UI.",
        Buttons = {
            { Title = "Got it", Icon = "check" }
        }
    })
    
    ------------------------------------------------------------
    -- 🪟 MAIN WINDOW (с key system)
    ------------------------------------------------------------
    local Window = WindUI:CreateWindow({
        Title   = "VezuntHUB - Country Manager",
        Author  = "by you",
        Icon    = "globe",
        Theme   = "Dark",
        Size    = UDim2.fromOffset(640, 520),
        Resizable = true,
        ScrollBarEnabled = true,
        OpenButton = {
            Title        = "Open VezuntHUB",
            CornerRadius = UDim.new(1, 0),
            StrokeThickness = 2,
            Enabled      = true,
            Draggable    = true,
            OnlyMobile   = false,
            Color        = ColorSequence.new(
                Color3.fromRGB(48, 167, 255),
                Color3.fromRGB(231, 255, 47)
            )
        },
    
        -- подключаем наш сервис сюда
        KeySystem = {
            Note = "Get link → open in browser → paste key here.",
            API = {
                {
                    Type    = "vezunthub",
                    BaseUrl = KEY_BACKEND,
                },
            },
        },
    })
    
    -- тег в окно
    Window:Tag({
        Title = "v" .. tostring(WindUI.Version or "1.0"),
        Icon = "github",
        Color = Color3.fromHex("#6b31ff")
    })
    
    ------------------------------------------------------------
    -- 🔗 ОТДЕЛЬНАЯ КНОПКА "GET LINK"
    ------------------------------------------------------------
    -- быстрый вариант (чтобы notify не ждал сервер)
    local function fastLink()
        return KEY_BACKEND .. "/get-key"
    end
    
    -- получить точный через /gate в фоне
    local function fetchGateLink()
        local status, body = httpGET_raw(KEY_BACKEND .. "/gate")
        if status == 200 and body then
            local ok, data = tryJSONDecode(body)
            if ok and data and data.url then
                return data.url
            end
        end
        return nil
    end
    
    local KeyTab = Window:Tab({
        Title = "Key link",
        Icon  = "link"
    })
    
    KeyTab:Section({
        Title = "Get key",
        Icon  = "key"
    }):Button({
        Title = "Get Link",
        Desc  = "Copy link → open in browser",
        Callback = function()
            -- 1) моментально даём быструю ссылку
            local link = fastLink()
    
            -- пробуем сразу скопировать
            local copied = false
            local function tryCopy(fn, val)
                local ok = pcall(fn, val)
                if ok then copied = true end
            end
            if setclipboard then
                tryCopy(setclipboard, link)
            elseif toclipboard then
                tryCopy(toclipboard, link)
            elseif syn and syn.write_clipboard then
                tryCopy(syn.write_clipboard, link)
            end
    
            -- показываем сразу
            WindUI:Notify({
                Title    = "Key link",
                Content  = copied and "Ссылка скопирована, вставь в браузер." or link,
                Icon     = "link",
                Duration = 3
            })
    
            -- 2) в фоне подтягиваем актуальную
            task.spawn(function()
                local real = fetchGateLink()
                if real and real ~= link then
                    if setclipboard then
                        pcall(setclipboard, real)
                    elseif toclipboard then
                        pcall(toclipboard, real)
                    elseif syn and syn.write_clipboard then
                        pcall(syn.write_clipboard, real)
                    end
                end
            end)
        end
    })
    
    ------------------------------------------------------------
    -- 🎨 COLORS
    ------------------------------------------------------------
    
    ------------------------------------------------------------
    -- 🎨 COLORS
    ------------------------------------------------------------
    local COLOR_BLUE   = Color3.fromHex("#30A7FF")
    local COLOR_GREEN  = Color3.fromHex("#30FF6A")
    local COLOR_RED    = Color3.fromHex("#FF3B30")
    local COLOR_YELLOW = Color3.fromHex("#E7FF2F")
    
    ------------------------------------------------------------
    -- 🧠 SERVICES
    ------------------------------------------------------------
    local Players           = game:GetService("Players")
    local ReplicatedStorage = game:GetService("ReplicatedStorage")
    local Workspace         = game:GetService("Workspace")
    local TweenService      = game:GetService("TweenService")
    local RunService        = game:GetService("RunService")
    local StatsService      = game:GetService("Stats")
    local UserInputService  = game:GetService("UserInputService")
    
    local player         = Players.LocalPlayer
    local registry       = ReplicatedStorage:WaitForChild("CountryRegistry")
    local regions        = Workspace:WaitForChild("Regions")
    local Remote         = ReplicatedStorage:WaitForChild("RemoteEvent_4")
    local SoldiersFolder = Workspace:WaitForChild("SoldiersFolder")
    local RemoteDef      = ReplicatedStorage:FindFirstChild("RemoteEvent_1") or Remote
    
    ------------------------------------------------------------
    -- 🔁 GLOBAL UPDATE CONFIG
    -- default: SLOW = true
    ------------------------------------------------------------
    local UpdateConfig = {
        slowMode         = true,  -- твоя просьба
        cityFastInterval = 5,
        citySlowInterval = 60,
        lbIntervalFast   = 10,
        lbIntervalSlow   = 60,
    }
    
    ------------------------------------------------------------
    -- 🛠 UTILITIES
    ------------------------------------------------------------
    local function readNumberFrom(country, key)
        if not country then return 0 end
        local obj = country:FindFirstChild(key)
        if obj and obj.Value ~= nil then
            local n = tonumber(obj.Value)
            if n then return n end
        end
        local attr = country:GetAttribute(key)
        if attr ~= nil then
            local n = tonumber(attr)
            if n then return n end
        end
        return 0
    end
    
    local function formatNumber(num)
        local n = tonumber(num or 0) or 0
        if n >= 1e9 then return string.format("%dB", math.floor(n/1e9))
        elseif n >= 1e6 then return string.format("%dM", math.floor(n/1e6))
        elseif n >= 1e3 then return string.format("%dK", math.floor(n/1e3))
        else return tostring(math.floor(n)) end
    end
    
    local function tierColor(t)
        if tonumber(t) and t <= 3 then return "🔴"
        elseif tonumber(t) and t <= 6 then return "🟡"
        else return "🟢" end
    end
    
    local function getLeaderAny(country)
        if not country then return nil end
        local v = country:FindFirstChild("ActiveLeader") or country:FindFirstChild("Leader") or country:FindFirstChild("Owner")
        if v and v.Value ~= nil then
            return v.Value
        end
        return country:GetAttribute("ActiveLeader") or country:GetAttribute("Leader") or country:GetAttribute("Owner")
    end
    
    local function isMyLeaderValue(v)
        if typeof(v) == "string" then
            return v == player.Name
        elseif typeof(v) == "Instance" then
            return v.Name == player.Name
        end
        return false
    end
    
    local function findMyCountry()
        for _, c in ipairs(registry:GetChildren()) do
            local leader = getLeaderAny(c)
            if isMyLeaderValue(leader) then
                return c
            end
        end
        return nil
    end
    
    local function calcMaxUnits(unitType)
        local c = findMyCountry()
        if not c then return 0 end
        local money    = readNumberFrom(c, "Money")
        local manpower = readNumberFrom(c, "Manpower")
        if unitType == "Soldier" then
            return math.min(math.floor(manpower / 1), math.floor(money / 100))
        elseif unitType == "Tank" then
            return math.min(math.floor(manpower / 100), math.floor(money / 100000))
        end
        return 0
    end
    
    local function getSafeParent()
        return Players.LocalPlayer:WaitForChild("PlayerGui")
    end
    
    ------------------------------------------------------------
    -- 📊 STATISTICS TAB
    ------------------------------------------------------------
    local StatsTab = Window:Tab({ Title = "Statistics", Icon = "bar-chart-3" })
    local StatsSection = StatsTab:Section({ Title = "Country stats", Icon = "bar-chart-3" })
    
    local statsParagraph = StatsSection:Paragraph({
        Title = "Country Statistics",
        Desc  = "Waiting for data...",
        Color = COLOR_BLUE
    })
    
    local currentCountry = nil
    local _lastStatsText = ""
    
    local function renderStats()
        local c = currentCountry or findMyCountry()
        if not c then
            if _lastStatsText ~= "❌ Country not found." then
                statsParagraph:SetDesc("❌ Country not found.")
                _lastStatsText = "❌ Country not found."
            end
            return
        end
        local money    = readNumberFrom(c, "Money")
        local manpower = readNumberFrom(c, "Manpower")
        local pp       = readNumberFrom(c, "PoliticalPower")
        local txt = string.format(
            "🏛 Country: %s\n💰 Money: %s\n👥 Manpower: %s\n⚖️ PoliticalPower: %s",
            c.Name, formatNumber(money), formatNumber(manpower), formatNumber(pp)
        )
        if txt ~= _lastStatsText then
            statsParagraph:SetDesc(txt)
            _lastStatsText = txt
        end
    end
    
    StatsSection:Button({
        Title = "🔄 Refresh Stats",
        Desc  = "Update your country info",
        Callback = function()
            currentCountry = findMyCountry()
            renderStats()
        end
    })
    
    -- toggle for slow/fast mode (user visible)
    local statsModeToggle
    statsModeToggle = StatsSection:Toggle({
        Title = "Slow update mode",
        Desc  = "WORLD map -> keep ON. EUROPE map -> you can OFF.",
        Type  = "Checkbox",
        Value = UpdateConfig.slowMode,
        Callback = function(state)
            UpdateConfig.slowMode = state
        end
    })
    
    -- stats itself not heavy, can update every second
    task.spawn(function()
        while task.wait(1) do
            currentCountry = findMyCountry() or currentCountry
            renderStats()
        end
    end)
    
    ------------------------------------------------------------
    -- 🌍 AUTO DETECT MAP AFTER 5s
    ------------------------------------------------------------
    task.spawn(function()
        task.wait(5)
        local countryCount = #registry:GetChildren()
        local regionCount  = #regions:GetChildren()
    
        local isWorld = (regionCount >= 500) or (countryCount >= 150)
        if isWorld then
            UpdateConfig.slowMode = true
            pcall(function()
                if statsModeToggle and statsModeToggle.Set then
                    statsModeToggle:Set(true)
                end
            end)
            WindUI:Notify({
                Title   = "Map detected",
                Content = "World map detected. Slow update mode is ON to prevent lag.",
                Icon    = "globe",
                Duration = 5
            })
        else
            UpdateConfig.slowMode = false
            pcall(function()
                if statsModeToggle and statsModeToggle.Set then
                    statsModeToggle:Set(false)
                end
            end)
            WindUI:Notify({
                Title   = "Map detected",
                Content = "Europe map detected. Normal update mode enabled.",
                Icon    = "map",
                Duration = 5
            })
        end
    end)
    
    ------------------------------------------------------------
    -- 🏙 TAB: CITIES (fixed ownership + chunked)
    ------------------------------------------------------------
    local CitiesTab = Window:Tab({ Title = "Cities", Icon = "building" })
    local CitiesSection = CitiesTab:Section({ Title = "My Cities", Icon = "building" })
    
    local citiesParagraph = CitiesSection:Paragraph({
        Title = "Cities",
        Desc  = "No data yet.",
        Color = COLOR_GREEN
    })
    
    -- у тебя выше уже объявлен RemoteDef
    local RemoteDef = ReplicatedStorage:FindFirstChild("RemoteEvent_1") or Remote
    
    -- вспомогалки именно для городов
    local function cityOwnedBy(city, myCountryName)
        if not city or not myCountryName then return false end
    
        -- 1) атрибут
        local attr = city:GetAttribute("Country")
        if attr and attr == myCountryName then
            return true
        end
    
        -- 2) вложенный объект City.Country
        local valObj = city:FindFirstChild("Country")
        if valObj and valObj.Value == myCountryName then
            return true
        end
    
        return false
    end
    
    local function readCityNum(city, name)
        if not city then return 0 end
        -- сначала атрибут
        local a = city:GetAttribute(name)
        if a ~= nil then
            local n = tonumber(a)
            if n then return n end
        end
        -- потом вложенный объект
        local v = city:FindFirstChild(name)
        if v and v.Value ~= nil then
            local n = tonumber(v.Value)
            if n then return n end
        end
        return 0
    end
    
    -- кэш, чтобы не спамить UI
    local CityCache = {
        busy = false,
        text = "No data yet.",
    }
    
    local function buildCitiesAsync()
        if CityCache.busy then return end
        CityCache.busy = true
    
        task.spawn(function()
            local myCountry = findMyCountry()
            if not myCountry then
                CityCache.text = "❌ Country not found."
                citiesParagraph:SetDesc(CityCache.text)
                CityCache.busy = false
                return
            end
    
            local myName = myCountry.Name
            local regs   = regions:GetChildren()
            local lines  = {}
            local total  = #regs
    
            for i = 1, total do
                local city = regs[i]
                if cityOwnedBy(city, myName) then
                    local tier = readCityNum(city, "DevelopTier")
                    local def  = readCityNum(city, "DefenceTier")
                    lines[#lines+1] = string.format(
                        "%s %s — Tier %d | 🛡 %d",
                        tierColor(tier),
                        city.Name,
                        tier,
                        def
                    )
                end
    
                -- отдаём кадр каждые 120 штук, чтобы не фризило
                if i % 120 == 0 then
                    task.wait()
                end
            end
    
            if #lines == 0 then
                CityCache.text = "No cities found."
            else
                table.sort(lines, function(a, b) return a:lower() < b:lower() end)
                if #lines > 200 then
                    local short = {}
                    for i = 1, 200 do
                        short[i] = lines[i]
                    end
                    short[#short+1] = string.format("... and %d more", #lines - 200)
                    CityCache.text = table.concat(short, "\n")
                else
                    CityCache.text = table.concat(lines, "\n")
                end
            end
    
            citiesParagraph:SetDesc(CityCache.text)
            CityCache.busy = false
        end)
    end
    
    -- кнопки остаются, только после них перерисовываем
    CitiesSection:Button({
        Title = "⬆ Upgrade All Cities (Tier)",
        Desc  = "Develop all owned cities",
        Callback = function()
            local ctry = findMyCountry()
            if not ctry then
                WindUI:Notify({ Title="No Country", Content="Join or lead a country first.", Icon="x-circle", Duration=2 })
                return
            end
            local count = 0
            for _, city in ipairs(regions:GetChildren()) do
                if cityOwnedBy(city, ctry.Name) then
                    pcall(function()
                        Remote:FireServer("DevelopTile", city, "Tier")
                    end)
                    count += 1
                    task.wait(0.03)
                end
            end
            WindUI:Notify({
                Title   = "Success",
                Content = string.format("Upgraded %d cities (Tier).", count),
                Icon    = "check-circle",
                Duration = 2
            })
            buildCitiesAsync()
        end
    })
    
    CitiesSection:Button({
        Title = "🛡️ Fortify All Cities (Defence)",
        Desc  = "Raise defence for all owned cities",
        Callback = function()
            local ctry = findMyCountry()
            if not ctry then
                WindUI:Notify({ Title="No Country", Content="Join or lead a country first.", Icon="x-circle", Duration=2 })
                return
            end
            if not RemoteDef then
                WindUI:Notify({
                    Title = "Missing RemoteEvent_1",
                    Content = "Cannot fortify cities: RemoteEvent_1 not found.",
                    Icon = "x-circle", Duration = 3
                })
                return
            end
            local count = 0
            for _, city in ipairs(regions:GetChildren()) do
                if cityOwnedBy(city, ctry.Name) then
                    pcall(function()
                        RemoteDef:FireServer("DevelopTile", city, "Def")
                    end)
                    count += 1
                    task.wait(0.03)
                end
            end
            WindUI:Notify({
                Title   = "Defense Raised",
                Content = string.format("Fortified %d cities (Defence).", count),
                Icon    = "shield",
                Duration = 2
            })
            buildCitiesAsync()
        end
    })
    
    CitiesSection:Button({
        Title = "⬆🛡️ Upgrade & Fortify All",
        Desc  = "Do both steps for every city",
        Callback = function()
            local ctry = findMyCountry()
            if not ctry then return end
            local upgraded, fortified = 0, 0
            for _, city in ipairs(regions:GetChildren()) do
                if cityOwnedBy(city, ctry.Name) then
                    pcall(function() Remote:FireServer("DevelopTile", city, "Tier") end)
                    upgraded += 1
                    task.wait(0.02)
                    if RemoteDef then
                        pcall(function() RemoteDef:FireServer("DevelopTile", city, "Def") end)
                        fortified += 1
                    end
                    task.wait(0.02)
                end
            end
            WindUI:Notify({
                Title   = "Done",
                Content = string.format("Upgraded: %d | Fortified: %d", upgraded, fortified),
                Icon    = "check-circle", Duration = 3
            })
            buildCitiesAsync()
        end
    })
    
    -- фоновое обновление с учётом slowMode
    task.spawn(function()
        buildCitiesAsync() -- первый раз сразу
        while true do
            local interval = UpdateConfig.slowMode and UpdateConfig.citySlowInterval or UpdateConfig.cityFastInterval
            buildCitiesAsync()
            task.wait(interval)
        end
    end)
    
    ------------------------------------------------------------
    -- ⚔ ARMY TAB (same as before)
    ------------------------------------------------------------
    local ArmyTab = Window:Tab({ Title = "Army", Icon = "shield" })
    local ArmySection = ArmyTab:Section({ Title = "Army Management", Icon = "shield" })
    
    ArmySection:Paragraph({
        Title = "How to use",
        Desc  = "1) Select city\n2) Select unit\n3) Spawn or auto-attack",
        Color = COLOR_RED
    })
    
    local function getMyCities()
        local ctry = findMyCountry()
        if not ctry then return {} end
        local out = {}
        for _, city in ipairs(regions:GetChildren()) do
            if city:GetAttribute("Country") == ctry.Name then
                out[#out+1] = city
            end
        end
        table.sort(out, function(a,b) return a.Name:lower() < b.Name:lower() end)
        return out
    end
    
    local selectedCity  = nil
    local selectedUnit  = "Soldier"
    
    local cityDropdown = ArmySection:Dropdown({
        Title   = "Select City",
        Desc    = "Choose one of your cities",
        Values  = { "--" },
        Value   = "--",
        Callback = function(value)
            if value ~= "--" then
                selectedCity = regions:FindFirstChild(value)
            else
                selectedCity = nil
            end
        end
    })
    
    local unitDropdown = ArmySection:Dropdown({
        Title   = "Select Unit",
        Desc    = "Unit to spawn",
        Values  = { "Soldier", "Tank" },
        Value   = "Soldier",
        Callback = function(value)
            selectedUnit = value
        end
    })
    
    local function refreshCityDropdown()
        local names = { "--" }
        for _, city in ipairs(getMyCities()) do
            names[#names+1] = city.Name
        end
        pcall(function()
            cityDropdown:Refresh(names)
            if selectedCity and table.find(names, selectedCity.Name) then
                cityDropdown:Select(selectedCity.Name)
            else
                cityDropdown:Select("--")
                selectedCity = nil
            end
        end)
    end
    
    -- hook add/remove
    task.spawn(function()
        regions.ChildAdded:Connect(refreshCityDropdown)
        regions.ChildRemoved:Connect(refreshCityDropdown)
    end)
    refreshCityDropdown()
    
    ArmySection:Button({
        Title = "👥/🛡 Spawn In Selected City (ALL)",
        Desc  = "Use all available resources",
        Callback = function()
            if not selectedCity then
                WindUI:Notify({ Title="Select City", Content="Please choose a city first.", Icon="info", Duration=2 })
                return
            end
            local max = calcMaxUnits(selectedUnit)
            if max <= 0 then
                WindUI:Notify({ Title="Not Enough Resources", Content="You don't have resources to spawn.", Icon="x-circle", Duration=2 })
                return
            end
            pcall(function() Remote:FireServer("CreateArmyOnTile", selectedCity, selectedUnit, max) end)
            WindUI:Notify({
                Title   = "Spawned",
                Content = string.format("%s × %d in %s", selectedUnit, max, selectedCity.Name),
                Icon    = "check-circle",
                Duration = 2
            })
        end
    })
    
    ArmySection:Button({
        Title = "🌍 Spawn EVEN Across ALL Cities",
        Desc  = "Distribute units over all owned cities",
        Callback = function()
            local cities = getMyCities()
            if #cities == 0 then
                WindUI:Notify({ Title="No Cities", Content="You have no cities to spawn in.", Icon="x-circle", Duration=2 })
                return
            end
            local total = calcMaxUnits(selectedUnit)
            if total <= 0 then
                WindUI:Notify({ Title="Not Enough Resources", Content="You don't have resources to spawn.", Icon="x-circle", Duration=2 })
                return
            end
            local perCity = math.max(1, math.floor(total / #cities))
            for _, city in ipairs(cities) do
                pcall(function() Remote:FireServer("CreateArmyOnTile", city, selectedUnit, perCity) end)
                task.wait(0.03)
            end
            WindUI:Notify({
                Title   = "Spawned Evenly",
                Content = string.format("%s × ~%d per city (%d cities)", selectedUnit, perCity, #cities),
                Icon    = "check-circle",
                Duration = 3
            })
        end
    })
    
    ArmySection:Button({
        Title = "⚡ Enable Auto-Attack (ALL my units)",
        Callback = function()
            local ctry = findMyCountry()
            if not ctry then return end
            for _, unit in ipairs(SoldiersFolder:GetChildren()) do
                local cn = unit:FindFirstChild("Country")
                if cn and cn.Value == ctry.Name then
                    pcall(function() Remote:FireServer("ToggleAutoCapture", unit, true) end)
                end
            end
            WindUI:Notify({ Title="Auto-Attack", Content="Enabled for all your units.", Icon="bolt", Duration=2 })
        end
    })
    
    ArmySection:Button({
        Title = "🚫 Disable Auto-Attack (ALL my units)",
        Callback = function()
            local ctry = findMyCountry()
            if not ctry then return end
            for _, unit in ipairs(SoldiersFolder:GetChildren()) do
                local cn = unit:FindFirstChild("Country")
                if cn and cn.Value == ctry.Name then
                    pcall(function() Remote:FireServer("ToggleAutoCapture", unit, false) end)
                end
            end
            WindUI:Notify({ Title="Auto-Attack", Content="Disabled for all your units.", Icon="x-circle", Duration=2 })
        end
    })
    
    ------------------------------------------------------------
    -- 👑 LEADERBOARD (chunked + respects UpdateConfig)
    ------------------------------------------------------------
    local LeaderTab = Window:Tab({ Title = "Leaderboard", Icon = "crown" })
    local LeaderSection = LeaderTab:Section({ Title = "Top Leaders", Icon = "crown" })
    
    local leaderboardParagraph = LeaderSection:Paragraph({
        Title = "Top leaders",
        Desc  = "Loading...",
        Color = COLOR_YELLOW
    })
    
    local LEADERBOARD_LIMIT  = 15
    local LEADERBOARD_CHUNK  = 80 -- per frame
    local _lastLeaderboardText = ""
    
    local function pretty(n)
        n = tonumber(n) or 0
        if n >= 1e9 then return (math.floor(n/1e9)).."B"
        elseif n >= 1e6 then return (math.floor(n/1e6)).."M"
        elseif n >= 1e3 then return (math.floor(n/1e3)).."K"
        else return tostring(math.floor(n)) end
    end
    
    local function getCountryLeaderName(country)
        local v = country:FindFirstChild("ActiveLeader") or country:FindFirstChild("Leader") or country:FindFirstChild("Owner")
        if v then
            if typeof(v.Value) == "string" and v.Value ~= "" then
                return v.Value
            elseif typeof(v.Value) == "Instance" and v.Value then
                return v.Value.Name
            end
        end
        local attr = country:GetAttribute("ActiveLeader") or country:GetAttribute("Leader") or country:GetAttribute("Owner")
        if typeof(attr) == "string" and attr ~= "" then
            return attr
        end
        return "—"
    end
    
    local lbRebuildRunning = false
    local function rebuildLeaderboardAsync()
        if lbRebuildRunning then return end
        lbRebuildRunning = true
        task.spawn(function()
            local allCountries = registry:GetChildren()
            if #allCountries == 0 then
                if _lastLeaderboardText ~= "No data." then
                    leaderboardParagraph:SetDesc("No data.")
                    _lastLeaderboardText = "No data."
                end
                lbRebuildRunning = false
                return
            end
    
            local rows = {}
            local index = 1
            local total = #allCountries
    
            while index <= total do
                local upper = math.min(index + LEADERBOARD_CHUNK - 1, total)
                for i = index, upper do
                    local country = allCountries[i]
                    rows[#rows+1] = {
                        name     = getCountryLeaderName(country),
                        country  = country.Name,
                        money    = readNumberFrom(country, "Money"),
                        manpower = readNumberFrom(country, "Manpower"),
                    }
                end
                index = upper + 1
                task.wait() -- yield
            end
    
            table.sort(rows, function(a, b)
                return (a.money or 0) > (b.money or 0)
            end)
    
            local limit = math.min(#rows, LEADERBOARD_LIMIT)
            local out = {}
            for i = 1, limit do
                local r = rows[i]
                out[#out+1] = string.format("👑 %s | 🏛 %s | 💰 %s | 👥 %s",
                    tostring(r.name or "—"),
                    tostring(r.country or "?"),
                    pretty(r.money),
                    pretty(r.manpower)
                )
            end
            local text = table.concat(out, "\n")
            if text ~= _lastLeaderboardText then
                leaderboardParagraph:SetDesc(text)
                _lastLeaderboardText = text
            end
    
            lbRebuildRunning = false
        end)
    end
    
    -- loop with dynamic interval
    task.spawn(function()
        rebuildLeaderboardAsync()
        while true do
            local interval = UpdateConfig.slowMode and UpdateConfig.lbIntervalSlow or UpdateConfig.lbIntervalFast
            task.wait(interval)
            rebuildLeaderboardAsync()
        end
    end)
    
    ------------------------------------------------------------
    -- 🧩 EXTRAS: FPS/Ping HUD (top-right) + utility widgets
    ------------------------------------------------------------
    local ExtrasTab = Window:Tab({ Title = "Extras", Icon = "monitor" })
    local ExtrasSection = ExtrasTab:Section({ Title = "UI / HUD", Icon = "monitor" })
    
    ExtrasSection:Paragraph({
        Title = "Controls",
        Desc  = "HUD, timers and small tools.",
        Color = COLOR_BLUE
    })
    
    -- main HUD
    local HUD = {
        Gui        = nil,
        Frame      = nil,
        Info       = nil,
        Visible    = false,
        RenderConn = nil,
        FpsEMA     = 60,
        Height     = 72,
    }
    
    local function createMainHUD()
        if HUD.Gui then return end
        local gui = Instance.new("ScreenGui")
        gui.Name = "VezuntMainHUD"
        gui.IgnoreGuiInset = true
        gui.ResetOnSpawn = false
        gui.Parent = getSafeParent()
    
        local frame = Instance.new("Frame")
        frame.Size = UDim2.new(0, 230, 0, HUD.Height)
        frame.Position = UDim2.new(1, -250, 0, 20)
        frame.BackgroundColor3 = Color3.fromRGB(25, 25, 25)
        frame.BackgroundTransparency = 0.12
        frame.BorderSizePixel = 0
        frame.Parent = gui
    
        local corner = Instance.new("UICorner")
        corner.CornerRadius = UDim.new(0, 12)
        corner.Parent = frame
    
        local stroke = Instance.new("UIStroke")
        stroke.Thickness = 1
        stroke.Transparency = 0.5
        stroke.Color = Color3.fromRGB(90, 90, 90)
        stroke.Parent = frame
    
        local title = Instance.new("TextLabel")
        title.BackgroundTransparency = 1
        title.Position = UDim2.new(0, 10, 0, 6)
        title.Size = UDim2.new(1, -20, 0, 22)
        title.Text = "🧠 VezuntHUD"
        title.Font = Enum.Font.SourceSansBold
        title.TextSize = 18
        title.TextColor3 = Color3.new(1, 1, 1)
        title.TextXAlignment = Enum.TextXAlignment.Left
        title.Parent = frame
    
        local info = Instance.new("TextLabel")
        info.BackgroundTransparency = 1
        info.Position = UDim2.new(0, 10, 0, 32)
        info.Size = UDim2.new(1, -20, 0, 32)
        info.Text = "FPS: ... | Ping: ..."
        info.Font = Enum.Font.SourceSans
        info.TextSize = 16
        info.TextColor3 = Color3.new(1, 1, 1)
        info.TextXAlignment = Enum.TextXAlignment.Left
        info.Parent = frame
    
        HUD.Gui   = gui
        HUD.Frame = frame
        HUD.Info  = info
    end
    
    local function showMainHUD()
        if HUD.Visible then return end
        createMainHUD()
        HUD.Visible = true
        HUD.Frame.Position = UDim2.new(1, 260, 0, 20)
        TweenService:Create(
            HUD.Frame,
            TweenInfo.new(0.35, Enum.EasingStyle.Quart, Enum.EasingDirection.Out),
            { Position = UDim2.new(1, -250, 0, 20) }
        ):Play()
    
        if HUD.RenderConn then HUD.RenderConn:Disconnect() end
        HUD.RenderConn = RunService.RenderStepped:Connect(function(dt)
            dt = dt > 0 and dt or (1/60)
            local instFps = 1 / dt
            HUD.FpsEMA = HUD.FpsEMA + (instFps - HUD.FpsEMA) * 0.2
        end)
    
        task.spawn(function()
            local pingItem = StatsService.Network
                and StatsService.Network.ServerStatsItem
                and StatsService.Network.ServerStatsItem["Data Ping"]
            while HUD.Visible and HUD.Info do
                task.wait(1)
                local fps  = math.clamp(math.floor(HUD.FpsEMA + 0.5), 1, 1000)
                local ping = "N/A"
                pcall(function()
                    if pingItem and pingItem.GetValue then
                        ping = tostring(math.floor(pingItem:GetValue())) .. "ms"
                    end
                end)
                HUD.Info.Text = ("FPS: %s | Ping: %s"):format(fps, ping)
            end
        end)
    end
    
    local function hideMainHUD()
        if not HUD.Visible then return end
        HUD.Visible = false
        if HUD.RenderConn then HUD.RenderConn:Disconnect(); HUD.RenderConn = nil end
        TweenService:Create(
            HUD.Frame,
            TweenInfo.new(0.28, Enum.EasingStyle.Quad, Enum.EasingDirection.In),
            { Position = UDim2.new(1, 260, 0, 20) }
        ):Play()
        task.delay(0.29, function()
            if HUD.Gui then HUD.Gui:Destroy() end
            HUD.Gui, HUD.Frame, HUD.Info = nil, nil, nil
        end)
    end
    
    local hudToggleElement
    hudToggleElement = ExtrasSection:Toggle({
        Title = "FPS/Ping HUD (H)",
        Desc  = "Top-right performance overlay.",
        Type  = "Checkbox",
        Value = true,
        Callback = function(state)
            if state then showMainHUD() else hideMainHUD() end
        end
    })
    
    showMainHUD()
    
    UserInputService.InputBegan:Connect(function(input, gp)
        if gp then return end
        if input.KeyCode == Enum.KeyCode.H then
            if HUD.Visible then
                hideMainHUD()
                if hudToggleElement and hudToggleElement.Set then hudToggleElement:Set(false) end
            else
                showMainHUD()
                if hudToggleElement and hudToggleElement.Set then hudToggleElement:Set(true) end
            end
        end
    end)
    
    ------------------------------------------------------------
    -- utility HUD under main (clock, session, notes)
    ------------------------------------------------------------
    local function getUtilityBaseY()
        if HUD.Visible then
            return 20 + HUD.Height + 10
        else
            return 20
        end
    end
    
    local RIGHT_X = -250
    local GAP_Y   = 6
    
    local Utility = {
        RootGui = nil,
        Holder  = nil,
        Widgets = {},
    }
    
    local function getUtilityRoot()
        if Utility.RootGui and Utility.RootGui.Parent then
            return Utility.RootGui
        end
        local gui = Instance.new("ScreenGui")
        gui.Name = "VezuntUtilityHUD"
        gui.IgnoreGuiInset = true
        gui.ResetOnSpawn = false
        gui.Parent = getSafeParent()
        Utility.RootGui = gui
        return gui
    end
    
    local function getHolder()
        if Utility.Holder and Utility.Holder.Parent then
            return Utility.Holder
        end
        local root = getUtilityRoot()
        local holder = Instance.new("Frame")
        holder.Name = "Holder"
        holder.AnchorPoint = Vector2.new(0, 0)
        holder.Size = UDim2.new(0, 230, 0, 0)
        holder.Position = UDim2.new(1, RIGHT_X, 0, getUtilityBaseY())
        holder.BackgroundTransparency = 1
        holder.BorderSizePixel = 0
        holder.Parent = root
    
        local list = Instance.new("UIListLayout")
        list.FillDirection = Enum.FillDirection.Vertical
        list.HorizontalAlignment = Enum.HorizontalAlignment.Left
        list.SortOrder = Enum.SortOrder.LayoutOrder
        list.Padding = UDim.new(0, GAP_Y)
        list.Parent = holder
    
        Utility.Holder = holder
        return holder
    end
    
    local function resizeHolderAnimated()
        local holder = getHolder()
        local totalH = 0
        for _, info in pairs(Utility.Widgets) do
            if info.Visible then
                totalH = totalH + info.Height + GAP_Y
            end
        end
        if totalH > 0 then totalH = totalH - GAP_Y end
        TweenService:Create(
            holder,
            TweenInfo.new(0.25, Enum.EasingStyle.Quad, Enum.EasingDirection.Out),
            {
                Size     = UDim2.new(0, 230, 0, totalH),
                Position = UDim2.new(1, RIGHT_X, 0, getUtilityBaseY())
            }
        ):Play()
    end
    
    local function createClockWidget()
        local frame = Instance.new("Frame")
        frame.Size = UDim2.new(1, 0, 0, 38)
        frame.BackgroundColor3 = Color3.fromRGB(20,20,20)
        frame.BackgroundTransparency = 0.08
        frame.BorderSizePixel = 0
    
        local corner = Instance.new("UICorner")
        corner.CornerRadius = UDim.new(0, 10)
        corner.Parent = frame
    
        local stroke = Instance.new("UIStroke")
        stroke.Color = Color3.fromRGB(90,90,90)
        stroke.Transparency = 0.4
        stroke.Thickness = 1
        stroke.Parent = frame
    
        local label = Instance.new("TextLabel")
        label.BackgroundTransparency = 1
        label.Size = UDim2.new(1, 0, 1, 0)
        label.Text = "--:--:--"
        label.Font = Enum.Font.SourceSansBold
        label.TextSize = 16
        label.TextColor3 = Color3.new(1,1,1)
        label.TextXAlignment = Enum.TextXAlignment.Center
        label.TextYAlignment = Enum.TextYAlignment.Center
        label.Parent = frame
    
        return frame
    end
    
    local function createSessionWidget()
        local frame = Instance.new("Frame")
        frame.Size = UDim2.new(1, 0, 0, 34)
        frame.BackgroundColor3 = Color3.fromRGB(20,20,20)
        frame.BackgroundTransparency = 0.08
        frame.BorderSizePixel = 0
    
        local corner = Instance.new("UICorner")
        corner.CornerRadius = UDim.new(0, 10)
        corner.Parent = frame
    
        local stroke = Instance.new("UIStroke")
        stroke.Color = Color3.fromRGB(90,90,90)
        stroke.Transparency = 0.4
        stroke.Thickness = 1
        stroke.Parent = frame
    
        local label = Instance.new("TextLabel")
        label.BackgroundTransparency = 1
        label.Size = UDim2.new(1, -8, 1, 0)
        label.Position = UDim2.new(0,4,0,0)
        label.Text = "Session: 0:00"
        label.Font = Enum.Font.SourceSans
        label.TextSize = 14
        label.TextColor3 = Color3.new(1,1,1)
        label.TextXAlignment = Enum.TextXAlignment.Left
        label.Parent = frame
    
        return frame
    end
    
    local function createNotesWidget()
        local frame = Instance.new("Frame")
        frame.Size = UDim2.new(1, 0, 0, 110)
        frame.BackgroundColor3 = Color3.fromRGB(18,18,18)
        frame.BackgroundTransparency = 0.08
        frame.BorderSizePixel = 0
    
        local corner = Instance.new("UICorner")
        corner.CornerRadius = UDim.new(0, 10)
        corner.Parent = frame
    
        local stroke = Instance.new("UIStroke")
        stroke.Color = Color3.fromRGB(90,90,90)
        stroke.Transparency = 0.5
        stroke.Thickness = 1
        stroke.Parent = frame
    
        local title = Instance.new("TextLabel")
        title.BackgroundTransparency = 1
        title.Position = UDim2.new(0,8,0,4)
        title.Size = UDim2.new(1, -16, 0, 16)
        title.Text = "📒 Notes"
        title.Font = Enum.Font.SourceSansBold
        title.TextSize = 14
        title.TextColor3 = Color3.new(1,1,1)
        title.TextXAlignment = Enum.TextXAlignment.Left
        title.Parent = frame
    
        local text = Instance.new("TextBox")
        text.BackgroundTransparency = 0.35
        text.BackgroundColor3 = Color3.fromRGB(10,10,10)
        text.Position = UDim2.new(0,8,0,24)
        text.Size = UDim2.new(1, -16, 1, -32)
        text.ClearTextOnFocus = false
        text.Font = Enum.Font.SourceSans
        text.TextSize = 14
        text.TextColor3 = Color3.new(1,1,1)
        text.TextXAlignment = Enum.TextXAlignment.Left
        text.TextYAlignment = Enum.TextYAlignment.Top
        text.TextWrapped = true
        text.MultiLine = true
        text.Text = "write here..."
        text.Parent = frame
    
        local corner2 = Instance.new("UICorner")
        corner2.CornerRadius = UDim.new(0, 6)
        corner2.Parent = text
    
        return frame
    end
    
    local function showWidget(name)
        local holder = getHolder()
        local info = Utility.Widgets[name]
    
        if not info then
            if name == "clock" then
                local frame = createClockWidget()
                frame.Parent = holder
                Utility.Widgets[name] = {
                    Frame = frame,
                    Height = 38,
                    Visible = false,
                    _run = true,
                }
                info = Utility.Widgets[name]
                task.spawn(function()
                    while info._run do
                        task.wait(1)
                        if info.Visible and info.Frame:FindFirstChild("TextLabel") then
                            local t = os.date("*t")
                            info.Frame.TextLabel.Text = string.format("%02d:%02d:%02d", t.hour, t.min, t.sec)
                        end
                    end
                end)
            elseif name == "session" then
                local frame = createSessionWidget()
                frame.Parent = holder
                Utility.Widgets[name] = {
                    Frame = frame,
                    Height = 34,
                    Visible = false,
                    Start   = os.time(),
                    _run    = true,
                }
                info = Utility.Widgets[name]
                task.spawn(function()
                    while info._run do
                        task.wait(1)
                        if info.Visible and info.Frame:FindFirstChild("TextLabel") then
                            local elapsed = os.time() - info.Start
                            local m = math.floor(elapsed / 60)
                            local s = elapsed % 60
                            info.Frame.TextLabel.Text = string.format("Session: %d:%02d", m, s)
                        end
                    end
                end)
            elseif name == "notes" then
                local frame = createNotesWidget()
                frame.Parent = holder
                Utility.Widgets[name] = {
                    Frame = frame,
                    Height = 110,
                    Visible = false,
                }
                info = Utility.Widgets[name]
            end
        end
    
        if info and not info.Visible then
            info.Visible = true
            info.Frame.Visible = true
            info.Frame.Size = UDim2.new(1, 0, 0, 0)
            TweenService:Create(
                info.Frame,
                TweenInfo.new(0.22, Enum.EasingStyle.Quad, Enum.EasingDirection.Out),
                { Size = UDim2.new(1, 0, 0, info.Height) }
            ):Play()
            resizeHolderAnimated()
        end
    end
    
    local function hideWidget(name)
        local info = Utility.Widgets[name]
        if not info or not info.Visible then return end
        info.Visible = false
        local frame = info.Frame
        TweenService:Create(
            frame,
            TweenInfo.new(0.2, Enum.EasingStyle.Quad, Enum.EasingDirection.In),
            { Size = UDim2.new(1, 0, 0, 0) }
        ):Play()
        task.delay(0.21, function()
            if frame then frame.Visible = false end
            resizeHolderAnimated()
        end)
    end
    
    ExtrasSection:Toggle({
        Title = "Clock HUD",
        Desc  = "Show local time.",
        Type  = "Checkbox",
        Value = true,
        Callback = function(state)
            if state then showWidget("clock") else hideWidget("clock") end
        end
    })
    
    ExtrasSection:Toggle({
        Title = "Session timer",
        Desc  = "Time since script loaded.",
        Type  = "Checkbox",
        Value = true,
        Callback = function(state)
            if state then showWidget("session") else hideWidget("session") end
        end
    })
    
    ExtrasSection:Toggle({
        Title = "Notes HUD",
        Desc  = "Small sticky note.",
        Type  = "Checkbox",
        Value = false,
        Callback = function(state)
            if state then showWidget("notes") else hideWidget("notes") end
        end
    })
    
    task.defer(function()
        showWidget("clock")
        showWidget("session")
    end)
    
    ------------------------------------------------------------
    -- 💬 CHAT TAB with notifications (same logic)
    ------------------------------------------------------------
    do
        local HttpService = game:GetService("HttpService")
    
        local RELAY_BASE   = "https://cchat-6cwm.onrender.com"
        local SEND_URL     = RELAY_BASE .. "/send"
        local POLL_URL     = RELAY_BASE .. "/poll"
        local AUTH_SECRET  = ""
    
        local requestFunc = (syn and syn.request) or http_request or request or (http and http.request)
    
        local lastNotifyTime = 0
        local NOTIFY_COOLDOWN = 3
    
        local function notifyNewMessage(author, content)
            local now = tick()
            if now - lastNotifyTime < NOTIFY_COOLDOWN then return end
            lastNotifyTime = now
            local short = tostring(content or "")
            if #short > 60 then
                short = short:sub(1, 57) .. "..."
            end
            WindUI:Notify({
                Title = (author and author ~= "" and ("New message: " .. author)) or "New message",
                Content = (short ~= "" and short) or "Empty message",
                Icon = "message-square",
                Duration = 3
            })
        end
    
        local function sendJSON(url, bodyTable)
            local bodyStr = HttpService:JSONEncode(bodyTable or {})
            local headers = { ["Content-Type"] = "application/json" }
            if AUTH_SECRET ~= "" then
                headers["Authorization"] = "Bearer " .. AUTH_SECRET
            end
            if requestFunc then
                local ok, res = pcall(function()
                    return requestFunc({
                        Url = url,
                        Method = "POST",
                        Headers = headers,
                        Body = bodyStr
                    })
                end)
                if ok and res and tonumber(res.StatusCode or 0) == 200 then
                    return true
                end
            end
            if HttpService.RequestAsync then
                local ok, res = pcall(function()
                    return HttpService:RequestAsync({
                        Url = url,
                        Method = "POST",
                        Headers = headers,
                        Body = bodyStr
                    })
                end)
                if ok and res and res.Success and tonumber(res.StatusCode or 0) == 200 then
                    return true
                end
            end
            pcall(function()
                game:HttpPost(url, bodyStr)
            end)
            return false
        end
    
        local function getJSON(url)
            local ok, raw = pcall(function()
                return game:HttpGet(url)
            end)
            if not ok or not raw or raw == "" then return nil end
            local ok2, data = pcall(function()
                return HttpService:JSONDecode(raw)
            end)
            if not ok2 then return nil end
            return data
        end
    
        local ChatTab = Window:Tab({ Title = "Chat", Icon = "message-square" })
        local ChatSection = ChatTab:Section({ Title = "Discord relay", Icon = "message-square" })
    
        ChatSection:Paragraph({
            Title = "Discord Chat",
            Desc  = "You will get a notification when a new message arrives.",
            Color = COLOR_BLUE
        })
    
        ChatSection:Button({
            Title = "Copy Invite Link",
            Callback = function()
                local link = "https://discord.gg/J5HFjYWqq7"
                local ok =
                    (getfenv and getfenv().setclipboard and pcall(getfenv().setclipboard, link)) or
                    (setclipboard and pcall(setclipboard, link)) or
                    (toclipboard and pcall(toclipboard, link)) or
                    ((syn and syn.write_clipboard) and pcall(syn.write_clipboard, link)) or
                    ((syn and syn.setclipboard) and pcall(syn.setclipboard, link))
                WindUI:Notify({
                    Title   = ok and "Copied" or "Copy failed",
                    Content = ok and "Invite link copied to clipboard." or "Your executor may not allow clipboard.",
                    Icon    = ok and "check-circle" or "x-circle",
                    Duration = 2
                })
            end
        })
    
        local fromName = (game.Players.LocalPlayer and game.Players.LocalPlayer.Name) or "Player"
    
        local MESSAGES   = {}
        local SEEN_IDS   = {}
        local LAST_ID    = 0
        local CHAT_MAX   = 150
        local chatDirty  = false
        local rendering  = false
    
        local chatLog = ChatSection:Paragraph({
            Title = "Messages",
            Desc  = "No messages yet.",
            Color = COLOR_GREEN
        })
    
        local draft = ""
        local msgInput = ChatSection:Input({
            Title = "Message",
            Placeholder = "Write your message...",
            Callback = function(v) draft = v or "" end
        })
    
        local function scheduleRender()
            chatDirty = true
            if rendering then return end
            rendering = true
            task.spawn(function()
                task.wait(0.05)
                if chatDirty then
                    chatDirty = false
                    local total = #MESSAGES
                    local start = math.max(1, total - CHAT_MAX + 1)
                    local view = {}
                    for i = start, total do
                        view[#view+1] = MESSAGES[i]
                    end
                    chatLog:SetDesc(table.concat(view, "\n"))
                end
                rendering = false
            end)
        end
    
        local function appendMessage(author, content, idNum)
            if idNum and SEEN_IDS[idNum] then return end
            if idNum then SEEN_IDS[idNum] = true end
            MESSAGES[#MESSAGES+1] = tostring(author or "User") .. ": " .. tostring(content or "")
            scheduleRender()
        end
    
        ChatSection:Button({
            Title = "Send",
            Callback = function()
                local text = (draft ~= "" and draft) or " "
                local ok = sendJSON(SEND_URL, { author = fromName, content = text })
                WindUI:Notify({
                    Title   = ok and "Sent" or "Failed",
                    Content = ok and "Delivered to Discord." or "Could not send message.",
                    Icon    = ok and "check-circle" or "x-circle",
                    Duration = 2
                })
                if ok then
                    appendMessage(fromName, text, nil)
                    draft = ""
                    pcall(function() msgInput:Set("") end)
                end
            end
        })
    
        local auto = true
        ChatSection:Toggle({
            Title = "Auto refresh (3s)",
            Desc  = "Pull messages from relay automatically.",
            Type  = "Checkbox",
            Value = true,
            Callback = function(state) auto = state end
        })
    
        local function pollOnce()
            local data = getJSON(POLL_URL .. "?after=" .. tostring(LAST_ID))
            if not data or type(data) ~= "table" then return false end
            local msgs = data.messages or {}
            if #msgs == 0 then return false end
            for i = 1, #msgs do
                local m = msgs[i]
                local idNum = tonumber(m.id) or 0
                if idNum > LAST_ID then LAST_ID = idNum end
                if not SEEN_IDS[idNum] then
                    local author  = tostring(m.author or "User")
                    local content = tostring(m.content or "")
                    appendMessage(author, content, idNum)
                    notifyNewMessage(author, content)
                end
            end
            return true
        end
    
        task.spawn(function()
            local waitTime = 3
            while true do
                if auto then
                    local ok = pcall(pollOnce)
                    if ok then waitTime = 3 else waitTime = 4 end
                end
                task.wait(waitTime)
            end
        end)
    
        pcall(pollOnce)
    end
    
    ------------------------------------------------------------
    -- 🔴 Border Highlight (OFF by default, chunked)
    ------------------------------------------------------------
    local HIGHLIGHT_COLOR    = Color3.fromRGB(180, 42, 248)
    local HIGHLIGHT_MATERIAL = "Metal"
    local originalAttrs      = {}
    local highlightedRegions = {}
    local highlightEnabled   = false
    
    local function findMyCountryName_auto()
        local plr = Players.LocalPlayer
        for _, country in ipairs(registry:GetChildren()) do
            local v = country:FindFirstChild("ActiveLeader") or country:FindFirstChild("Leader") or country:FindFirstChild("Owner")
            if v and v.Value ~= nil then
                if typeof(v.Value) == "string" and v.Value == plr.Name then
                    return country.Name
                elseif typeof(v.Value) == "Instance" and v.Value == plr then
                    return country.Name
                end
            end
            local attr = country:GetAttribute("ActiveLeader") or country:GetAttribute("Leader") or country:GetAttribute("Owner")
            if attr and attr == plr.Name then
                return country.Name
            end
        end
        return nil
    end
    
    local function highlightOneRegion(region)
        local gen = region:FindFirstChild("GeneratedRegion")
        if not gen then return false end
        if not originalAttrs[region] then
            originalAttrs[region] = {
                color    = gen:GetAttribute("Color"),
                material = gen:GetAttribute("Material"),
            }
        end
        gen:SetAttribute("Color", HIGHLIGHT_COLOR)
        gen:SetAttribute("Material", HIGHLIGHT_MATERIAL)
        highlightedRegions[region] = true
        return true
    end
    
    local function restoreOneRegion(region)
        local gen = region:FindFirstChild("GeneratedRegion")
        if not gen then return false end
        local saved = originalAttrs[region]
        if saved then
            if saved.color ~= nil then gen:SetAttribute("Color", saved.color) end
            if saved.material ~= nil then gen:SetAttribute("Material", saved.material) end
        end
        originalAttrs[region] = nil
        highlightedRegions[region] = nil
        return true
    end
    
    local function enableBorderHighlightAttr()
        if highlightEnabled then return end
        local myName = findMyCountryName_auto()
        if not myName then
            WindUI:Notify({
                Title = "Highlight",
                Content = "Could not detect your country.",
                Icon = "x-circle",
                Duration = 3
            })
            return
        end
        highlightEnabled = true
        task.spawn(function()
            local changed, batch = 0, 0
            for _, region in ipairs(regions:GetChildren()) do
                if not highlightEnabled then break end
                if region:GetAttribute("Country") == myName then
                    if highlightOneRegion(region) then
                        changed += 1
                        batch += 1
                    end
                end
                if batch >= 50 then
                    batch = 0
                    task.wait()
                end
            end
            WindUI:Notify({
                Title   = "Highlight enabled",
                Content = string.format("Updated regions: %d", changed),
                Icon    = "map",
                Duration = 3
            })
        end)
    end
    
    local function disableBorderHighlightAttr()
        if not highlightEnabled then return end
        highlightEnabled = false
        task.spawn(function()
            local restored, batch = 0, 0
            for region, _ in pairs(highlightedRegions) do
                if restoreOneRegion(region) then
                    restored += 1
                end
                batch += 1
                if batch >= 60 then
                    batch = 0
                    task.wait()
                end
            end
            highlightedRegions = {}
            originalAttrs = {}
            WindUI:Notify({
                Title   = "Highlight disabled",
                Content = string.format("Restored regions: %d", restored),
                Icon    = "map",
                Duration = 2
            })
        end)
    end
    
    local function reapplyColorToHighlighted()
        if not highlightEnabled then return end
        task.spawn(function()
            local batch = 0
            for region, _ in pairs(highlightedRegions) do
                local gen = region:FindFirstChild("GeneratedRegion")
                if gen then
                    gen:SetAttribute("Color", HIGHLIGHT_COLOR)
                end
                batch += 1
                if batch >= 60 then
                    batch = 0
                    task.wait()
                end
            end
        end)
    end
    
    local function reapplyMaterialToHighlighted()
        if not highlightEnabled then return end
        task.spawn(function()
            local batch = 0
            for region, _ in pairs(highlightedRegions) do
                local gen = region:FindFirstChild("GeneratedRegion")
                if gen then
                    gen:SetAttribute("Material", HIGHLIGHT_MATERIAL)
                end
                batch += 1
                if batch >= 60 then
                    batch = 0
                    task.wait()
                end
            end
        end)
    end
    
    local HighlightTab = Window:Tab({ Title = "Border Highlight", Icon = "map" })
    local HighlightSection = HighlightTab:Section({ Title = "My regions", Icon = "map" })
    
    HighlightSection:Paragraph({
        Title = "Region Highlight",
        Desc  = "Color + material for your regions. Off by default.",
        Color = Color3.fromRGB(255, 100, 100)
    })
    
    HighlightSection:Toggle({
        Title = "Enable Highlight",
        Desc  = "Apply style to your regions (slow on big maps).",
        Type  = "Checkbox",
        Value = false,
        Callback = function(state)
            if state then
                enableBorderHighlightAttr()
            else
                disableBorderHighlightAttr()
            end
        end
    })
    
    HighlightSection:Colorpicker({
        Title = "Highlight Color",
        Desc  = "Pick a color.",
        Default = HIGHLIGHT_COLOR,
        Transparency = 0,
        Locked = false,
        Callback = function(color)
            HIGHLIGHT_COLOR = color
            reapplyColorToHighlighted()
        end
    })
    
    HighlightSection:Dropdown({
        Title = "Highlight Material",
        Desc  = "Pick a material.",
        Values = { "Metal", "SmoothPlastic", "Plastic", "Neon", "Wood", "Grass" },
        Value  = "Metal",
        Callback = function(matName)
            HIGHLIGHT_MATERIAL = matName
            reapplyMaterialToHighlighted()
        end
    })
    
    HighlightSection:Button({
        Title = "Reset Highlight",
        Desc  = "Restore original values.",
        Callback = function()
            disableBorderHighlightAttr()
        end
    })
    
    ------------------------------------------------------------
    -- ✅ FINAL INIT
    ------------------------------------------------------------
    renderStats()
    refreshCityDropdown()
    
    WindUI:Notify({
        Title = "VezuntHUB Loaded",
        Content = "Press P to show/hide interface",
        Icon = "check-circle",
        Duration = 3
    })
    
end

local function _rubPFHDGdD()
  if __GamelistLoader then
      __GamelistLoader:Destroy()
  end
    if false then
      -- Use local JunkieProtected (initialized above)
      if _G.SCRIPT_KEY and JunkieProtected.ValidateKey({Key=_G.SCRIPT_KEY}) == "valid" then
            pcall(_uskfurGeYE)
      else
        -- Use local JunkieProtected (initialized above)
        JunkieProtected.QuickStartUI({
          provider="Mixed",
          title="Script Access",
          subtitle="Key Verification Required",
          service="Default",
          description="Please verify your key to continue",
          onSuccess=function(result)
                    pcall(_uskfurGeYE)
          end,
          onError=function(err) end
        })
    end
  else
        pcall(_uskfurGeYE)
  end
end

_rubPFHDGdD()
