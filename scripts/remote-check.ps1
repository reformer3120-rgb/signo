# 폰에서 붙기 전에 이 PC 가 준비됐는지 본다.
#
# 밖에 나가서 안 붙는 것만큼 답답한 것이 없다. 나가기 전에 한 번 돌린다.
#
#   powershell -ExecutionPolicy Bypass -File scripts\원격-점검.ps1

$ok = $true
function 확인($이름, $좋은가, $좋을때, $나쁠때) {
  if ($좋은가) { Write-Output "  [O] $이름 — $좋을때" }
  else { Write-Output "  [X] $이름 — $나쁠때"; $script:ok = $false }
}

Write-Output "== 원격 준비 점검 =="
Write-Output ""

# 1. 절전 — 잠들면 폰에서 못 깨운다 (Wake-on-LAN 을 따로 안 걸었다)
$g = ((powercfg /getactivescheme) -split 'GUID: ')[1].Split(' ')[0]
function 시간($sub, $set) {
  $hex = ((powercfg /query $g $sub $set 2>$null) | Select-String '0x[0-9a-f]{8}' -AllMatches).Matches.Value
  if ($hex.Count -ge 2) { [Convert]::ToInt32($hex[$hex.Count-2], 16) } else { -1 }
}
$sleep = 시간 'SUB_SLEEP' 'STANDBYIDLE'
확인 "절전" ($sleep -eq 0) "콘센트에서 안 잠듦" "콘센트에서 $([int]($sleep/60))분 뒤 잠듦 — 폰에서 못 깨운다"

# 노트북이면 콘센트에 꽂혀 있어야 위 설정이 먹는다.
#
# 이게 제일 잘 걸린다. "켜놓고 갈게" 하고 뽑아 두면 배터리 기준이 적용돼
# 15분 뒤 잠들고, 잠들면 폰에서 깨울 방법이 없다.
# BatteryStatus 는 값 뜻이 헷갈려서 PowerLineStatus 로 본다.
$bat = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue
if ($bat) {
  Add-Type -AssemblyName System.Windows.Forms
  $ps = [System.Windows.Forms.SystemInformation]::PowerStatus
  $배터리절전 = 시간 'SUB_SLEEP' 'STANDBYIDLE'
  $hexdc = ((powercfg /query $g SUB_SLEEP STANDBYIDLE 2>$null) | Select-String '0x[0-9a-f]{8}' -AllMatches).Matches.Value
  $dc = if ($hexdc.Count -ge 1) { [Convert]::ToInt32($hexdc[$hexdc.Count-1],16) } else { 0 }
  확인 "전원" ($ps.PowerLineStatus -eq 'Online') `
    "콘센트 연결됨" ("배터리로 도는 중(" + [int]($ps.BatteryLifePercent*100) + "%) — " +
                     $(if ($dc -gt 0) { "$([int]($dc/60))분 뒤 잠든다. 꽂을 것" } else { "꽂아 둘 것" }))
  Write-Output "  [ ] 덮개 — 닫고 갈 거면 '덮개를 닫을 때: 아무 것도 안 함' 인지 볼 것"
  Write-Output "        (삼성 전원 계획이라 스크립트로는 못 읽는다. 제어판 > 전원 옵션)"
}

# 2. 크롬 원격 데스크톱 호스트
$crd = Get-Service chromoting -ErrorAction SilentlyContinue
확인 "크롬 원격 데스크톱" ($crd -and $crd.Status -eq 'Running') `
  "돌고 있음" "설치 안 됐거나 멈춤 — remotedesktop.google.com/access"

# 3. 인터넷
확인 "인터넷" (Test-Connection 8.8.8.8 -Count 1 -Quiet -ErrorAction SilentlyContinue) `
  "연결됨" "끊김"

# 4. 윗층 주간 갱신 — 나가 있는 동안 월요일이 끼면 이게 돌아야 한다
$t = schtasks /query /tn "SIGNO-upper-refresh" /fo list 2>$null
확인 "윗층 주간 갱신" ($LASTEXITCODE -eq 0) "등록돼 있음 (월 07:00)" "등록 안 됨"

# 5. 저장소가 다 올라가 있나 — 안 올라간 커밋은 폰에서 못 본다
Push-Location C:\signo
$안올림 = (git rev-list --count '@{u}..HEAD' 2>$null)
$뭔가있나 = (git status --porcelain 2>$null | Measure-Object -Line).Lines
Pop-Location
확인 "저장소" ($안올림 -eq '0' -and $뭔가있나 -eq 0) `
  "다 올라감" "안 올린 커밋 $안올림 개 · 손댄 파일 $뭔가있나 개 — 폰에서는 안 보인다"

Write-Output ""
if ($ok) { Write-Output "준비 끝. 나가도 된다." }
else { Write-Output "위 [X] 를 먼저 볼 것." }
