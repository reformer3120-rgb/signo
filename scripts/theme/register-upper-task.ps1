# 윗층 테마판 주간 갱신을 Windows 작업 스케줄러에 등록한다.
#
# 왜 이 PC 에서 도나 — 네이버 목록과 일봉 10MB 를 받아야 해서 Vercel 크론
# (60초 제한)에 안 들어간다. 그래서 이 PC 가 주 1회 돌리고 결과만 올린다.
#
# 언제 — 월요일 07:00. 장이 열리기 전이라 KIS 가 한가하고, 직전 금요일 종가로
# 잰 판이 그 주 내내 쓰인다.
#
# PC 가 꺼져 있었으면 — StartWhenAvailable 로 켜진 뒤 곧 따라 돈다.
#
#   등록    powershell -ExecutionPolicy Bypass -File scripts\theme\register-upper-task.ps1
#   확인    schtasks /query /tn "SIGNO-upper-refresh" /v /fo list
#   지우기  schtasks /delete /tn "SIGNO-upper-refresh" /f
#   지금 한 번 돌리기  schtasks /run /tn "SIGNO-upper-refresh"

$ErrorActionPreference = "Stop"
$TaskName = "SIGNO-upper-refresh"   # 한글 이름은 0x8007007b 로 거부된다
$Root     = "C:\signo"
$NodeExe  = (Get-Command node).Source

if (-not (Test-Path "$Root\scripts\theme\refresh-upper.mjs")) {
  throw "$Root 에서 refresh-upper.mjs 를 못 찾았다."
}

$action = New-ScheduledTaskAction `
  -Execute $NodeExe `
  -Argument "scripts\theme\refresh-upper.mjs" `
  -WorkingDirectory $Root

$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 07:00

# 배터리로 돌아가도 돌린다(노트북), 놓쳤으면 켜진 뒤 따라 돈다,
# 한 시간 넘게 걸리면 뭔가 잘못된 것이므로 끊는다.
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -DontStopIfGoingOnBatteries `
  -AllowStartIfOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
  -MultipleInstances IgnoreNew

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "윗층 테마판을 주 1회 새로 만들어 커밋·푸시한다. 로그는 C:\signo\.cache\refresh-upper.log" `
  -Force | Out-Null

Write-Output "등록 완료 — $TaskName"
Write-Output "  실행     $NodeExe scripts\theme\refresh-upper.mjs"
Write-Output "  작업폴더  $Root"
Write-Output "  주기     매주 월요일 07:00 (놓치면 켜진 뒤 따라 돈다)"
Write-Output "  로그     $Root\.cache\refresh-upper.log"
Write-Output ""
Write-Output "지금 한 번 돌려 보려면:  schtasks /run /tn `"$TaskName`""
