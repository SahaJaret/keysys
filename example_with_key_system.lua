-- 🔐 KEY SYSTEM PROTECTION
-- This code is automatically added and hidden from editor
-- KEY_BACKEND is automatically set based on your deployment:
--   Local: http://localhost:3000
--   Render: https://your-app.onrender.com
local KEY_BACKEND = "http://localhost:3000"  -- (example for local dev)

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
    -- ============================================================
    -- ⬇️⬇️⬇️ ТВОЙ ОРИГИНАЛЬНЫЙ КОД НАЧИНАЕТСЯ ЗДЕСЬ ⬇️⬇️⬇️
    -- ============================================================
    
    -- 🎮 TEST SCRIPT - Simple Example
    -- Этот код ты будешь видеть в редакторе
    
    print("=" .. string.rep("=", 50))
    print("🎮 VEZUNT HUB - Test Script")
    print("=" .. string.rep("=", 50))
    
    local player = game.Players.LocalPlayer
    print("👤 Player: " .. player.Name)
    print("🆔 User ID: " .. tostring(player.UserId))
    
    -- Notification
    game.StarterGui:SetCore("SendNotification", {
        Title = "✅ Script Loaded";
        Text = "Welcome, " .. player.Name .. "!";
        Duration = 5;
    })
    
    -- Simple GUI
    local ScreenGui = Instance.new("ScreenGui")
    ScreenGui.Name = "TestGUI"
    ScreenGui.ResetOnSpawn = false
    ScreenGui.Parent = game:GetService("CoreGui")
    
    local Frame = Instance.new("Frame")
    Frame.Size = UDim2.new(0, 300, 0, 200)
    Frame.Position = UDim2.new(0.5, -150, 0.5, -100)
    Frame.BackgroundColor3 = Color3.fromRGB(30, 30, 40)
    Frame.BorderSizePixel = 0
    Frame.Parent = ScreenGui
    
    local Corner = Instance.new("UICorner")
    Corner.CornerRadius = UDim.new(0, 10)
    Corner.Parent = Frame
    
    local Title = Instance.new("TextLabel")
    Title.Size = UDim2.new(1, 0, 0, 50)
    Title.BackgroundColor3 = Color3.fromRGB(40, 120, 255)
    Title.BorderSizePixel = 0
    Title.Text = "✅ KEY VERIFIED!"
    Title.TextColor3 = Color3.fromRGB(255, 255, 255)
    Title.TextSize = 20
    Title.Font = Enum.Font.GothamBold
    Title.Parent = Frame
    
    local TitleCorner = Instance.new("UICorner")
    TitleCorner.CornerRadius = UDim.new(0, 10)
    TitleCorner.Parent = Title
    
    local Cover = Instance.new("Frame")
    Cover.Position = UDim2.new(0, 0, 1, -10)
    Cover.Size = UDim2.new(1, 0, 0, 10)
    Cover.BackgroundColor3 = Color3.fromRGB(40, 120, 255)
    Cover.BorderSizePixel = 0
    Cover.Parent = Title
    
    local Info = Instance.new("TextLabel")
    Info.Position = UDim2.new(0, 20, 0, 70)
    Info.Size = UDim2.new(1, -40, 0, 100)
    Info.BackgroundTransparency = 1
    Info.Text = "🔑 Key System works!\n\n✅ Access granted\n⚡ Script loaded\n🎮 Enjoy!"
    Info.TextColor3 = Color3.fromRGB(200, 200, 200)
    Info.TextSize = 14
    Info.Font = Enum.Font.Gotham
    Info.TextWrapped = true
    Info.TextYAlignment = Enum.TextYAlignment.Top
    Info.Parent = Frame
    
    local CloseButton = Instance.new("TextButton")
    CloseButton.Position = UDim2.new(0, 20, 0, 150)
    CloseButton.Size = UDim2.new(1, -40, 0, 35)
    CloseButton.BackgroundColor3 = Color3.fromRGB(50, 200, 100)
    CloseButton.BorderSizePixel = 0
    CloseButton.Text = "Close"
    CloseButton.TextColor3 = Color3.fromRGB(255, 255, 255)
    CloseButton.TextSize = 16
    CloseButton.Font = Enum.Font.GothamBold
    CloseButton.Parent = Frame
    
    local ButtonCorner = Instance.new("UICorner")
    ButtonCorner.CornerRadius = UDim.new(0, 8)
    ButtonCorner.Parent = CloseButton
    
    CloseButton.MouseButton1Click:Connect(function()
        ScreenGui:Destroy()
    end)
    
    print("")
    print("✅ Script executed successfully!")
    print("🔑 Key validation passed!")
    print("=" .. string.rep("=", 50))
    
    -- ============================================================
    -- ⬆️⬆️⬆️ ТВОЙ ОРИГИНАЛЬНЫЙ КОД ЗАКАНЧИВАЕТСЯ ЗДЕСЬ ⬆️⬆️⬆️
    -- ============================================================
end)

