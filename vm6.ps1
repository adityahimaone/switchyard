$nvm = "C:\Users\User\AppData\Roaming\nvm\nvm.exe"
Write-Output "=== nvm install 24.19.0 ==="
& $nvm install 24.19.0 2>&1 | Out-String | Write-Output
Write-Output ("exit=" + $LASTEXITCODE)
Write-Output "=== nvm versions dir after ==="
Get-ChildItem "C:\Users\User\AppData\Roaming\nvm" -Directory | Select-Object -ExpandProperty Name
Write-Output "=== symlink now ==="
$it = Get-Item "C:\Program Files\nodejs" -Force
Write-Output ("Target=" + ($it.Target -join ","))
