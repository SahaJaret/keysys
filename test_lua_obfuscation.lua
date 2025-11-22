-- Test obfuscated code execution
print("=== Testing Obfuscated Code ===")

-- This is what our obfuscation generates:
local _ssyltsjy={27,3,16,25,31,70,17,89,5,8,11,5,76,78,88,20,7,12,80,74,33,2,22,21,22,10,0,72,45,90,7,16,2,39,0,18,1,22,20,107,89,11,18,15,27,76,30,29,0,21,0,82,1,81,83,87,78,59,29,31,10,14,21,70,81,64,89,76,3,20,18,31,4,71,74,63,15,26,9,83,86,93,70,67,20,70,123,30,5,5,29,12,91,11,4,70,23,16,9,18,69,121,114,20,7,12,80,74,34,26,22,30,7,29,1,33,20,92,94,34,11,3,47,28,10,22,78,67,102,1,31,10,57,3,7,17,21,15,2,84,16,24,1,25,78,95,88,8,108,65,21,68,81,58,30,24,31,29,83,91,65,23,52,3,1,3,9,16,12,22,2,65,102,7,3,7,7,24,81,67,121,70,65,21,68,37,11,15,24,83,69,83,68,45,90,5,21,11,19,76,0,13,16,5,4,70,23,23,27,27,0,10,89,81,93,107,21,68,81,78,51,25,1,25,7,15,14,91,68,76,78,68,87,121,5,90};
local _bsvotmeg="wlsxsfa5dqn";
local _ayfddxgb=function(_nhkyhtsx,_bsvotmeg)
    local _iwyzzscc="";
    for _stjdlywb=1,#_nhkyhtsx do 
        local _yuxnprij=_nhkyhtsx[_stjdlywb];
        local _ncgedabq=string.char(_yuxnprij~string.byte(_bsvotmeg,(_stjdlywb-1)%#_bsvotmeg+1));
        _iwyzzscc=_iwyzzscc.._ncgedabq 
    end;
    return _iwyzzscc 
end;

-- Decode the script
local _tccpdaqm=_ayfddxgb(_ssyltsjy,_bsvotmeg);

print("\n=== Decoded Script ===")
print(_tccpdaqm)

-- Try to execute it
print("\n=== Executing Obfuscated Code ===")
local _iwyzzscc,_ghyeofla=loadstring(_tccpdaqm);
if _iwyzzscc then 
    local success, result = pcall(_iwyzzscc)
    if success then
        print("✓ SUCCESS! Obfuscated code works!")
    else
        print("✗ ERROR during execution:", result)
    end
else 
    print("✗ ERROR: Failed to load code")
    print("Error:", _ghyeofla)
end

