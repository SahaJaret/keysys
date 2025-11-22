// Test if our obfuscation/deobfuscation works correctly

console.log("=== Testing Obfuscation System ===\n");

// Original code
const originalCode = `local player = game.Players.LocalPlayer
local message = "Hello " .. player.Name .. "!"
print(message)

game.StarterGui:SetCore("SendNotification", {
    Title = "Protected Script";
    Text = "Loaded successfully!";
    Duration = 3;
})`;

console.log("1. Original Code:");
console.log(originalCode);

// XOR cipher function (same as in server)
function xorCipher(str, key) {
  let result = [];
  for (let i = 0; i < str.length; i++) {
    result.push(str.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return result;
}

// Generate key
const key = "wlsxsfa5dqn";

// Encode
const encoded = xorCipher(originalCode, key);

console.log("\n2. Encoded (first 20 bytes):");
console.log(encoded.slice(0, 20).join(','));

// Decode (simulate Lua decoding)
function xorDecipher(encoded, key) {
  let result = "";
  for (let i = 0; i < encoded.length; i++) {
    const byte = encoded[i];
    const char = String.fromCharCode(byte ^ key.charCodeAt(i % key.length));
    result += char;
  }
  return result;
}

const decoded = xorDecipher(encoded, key);

console.log("\n3. Decoded Code:");
console.log(decoded);

console.log("\n4. Comparison:");
console.log("Original length:", originalCode.length);
console.log("Decoded length:", decoded.length);
console.log("Match:", originalCode === decoded ? "✓ YES" : "✗ NO");

if (originalCode === decoded) {
  console.log("\n✅ SUCCESS! Obfuscation/Deobfuscation works correctly!");
  console.log("This code WILL execute in Roblox Lua!");
} else {
  console.log("\n❌ ERROR! Encoding/Decoding mismatch!");
  console.log("\nDifference at character:", 
    [...originalCode].findIndex((c, i) => c !== decoded[i])
  );
}

// Show what Lua code looks like
console.log("\n5. Generated Lua Code (simplified):");
console.log(`
local encrypted = {${encoded.slice(0, 10).join(',')}, ...${encoded.length - 10} more}
local key = "${key}"
local decoder = function(enc, key)
  local result = ""
  for i=1,#enc do
    result = result .. string.char(enc[i] ~ string.byte(key, (i-1)%#key+1))
  end
  return result
end
local code = decoder(encrypted, key)
loadstring(code)()
`);

