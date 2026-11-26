param(
  [string]$Portal = 'Relay QA',
  [string]$Url = 'http://127.0.0.1:5173/'
)

# Start npm run qa:preview before running this script in Maestri.
$ErrorActionPreference = 'Stop'

function Invoke-Portal {
  param([string]$Action, [string[]]$Arguments = @())
  $result = & maestri portal $Action $Portal @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Portal command failed: $Action" }
  $result
}

function Assert-Portal {
  param([string]$Name, [string]$Expression)
  $result = Invoke-Portal evaluate @($Expression)
  if ("$result" -ne 'true') { throw "$Name failed. Result: $result" }
  Write-Output "PASS $Name"
}

Invoke-Portal navigate @($Url) | Out-Null
Invoke-Portal wait @('.accounts-grid-layout', '8000') | Out-Null
Assert-Portal 'preview without access to local history' '!window.relay'

try {
  foreach ($viewport in @(
    @{ Width = 1900; Height = 1192; Columns = 3 },
    @{ Width = 1080; Height = 740; Columns = 3 },
    @{ Width = 860; Height = 580; Columns = 2 }
  )) {
    $size = "$($viewport.Width)x$($viewport.Height)"
    Invoke-Portal resize @("$($viewport.Width)", "$($viewport.Height)") | Out-Null

    Invoke-Portal click @('.nav-tab:nth-child(1)') | Out-Null
    Assert-Portal "$size account columns" "getComputedStyle(document.querySelector('.accounts-grid-layout')).gridTemplateColumns.split(' ').length === $($viewport.Columns)"
    Assert-Portal "$size account content fits" 'document.querySelector(".main-view").scrollWidth === document.querySelector(".main-view").clientWidth'
    Assert-Portal "$size account tabs and filters stay on one line" '[...document.querySelectorAll(".nav-tab,.subnav-filters .filter-pill")].every(el => getComputedStyle(el).whiteSpace === "nowrap" || el.clientHeight <= 24 || el.classList.contains("nav-tab") && el.scrollWidth <= el.clientWidth)'
    Assert-Portal "$size account grid shows quotas without static models" 'Boolean(document.querySelector(".account-card-box .meters-container")) && !document.querySelector(".model-chip,.models-container")'
    Invoke-Portal click @('.view-mode-toggle button:last-child') | Out-Null
    Assert-Portal "$size account table shows quotas without a models column" '(() => { const columns = [...document.querySelectorAll(".accounts-table th")].map(el => el.textContent); return columns.includes("Semanal") && !columns.some(label => /modelos/i.test(label)) })()'
    Invoke-Portal click @('.view-mode-toggle button:first-child') | Out-Null

    Invoke-Portal click @('.nav-tab:nth-child(2)') | Out-Null
    Assert-Portal "$size terminal actions fit" '(() => { const table = document.querySelector(".terminals-table-scroll"); return table.scrollWidth <= table.clientWidth + 1 && getComputedStyle(table).overflowX === "auto" })()'
    Assert-Portal "$size terminal summary cards" '[...document.querySelectorAll(".terminals-kpi-grid .kpi-label")].map(el => el.textContent).join("|") === "SAÚDE DA FROTA|FAILOVER WATCHER"'
    Assert-Portal "$size terminal table has no static models" '[...document.querySelectorAll(".terminals-table th")].every(el => !/modelos/i.test(el.textContent)) && !document.querySelector(".terminals-table .model-chip")'
    Assert-Portal "$size terminal model appears only when detected" '(() => { const rows = [...document.querySelectorAll(".terminals-table tbody tr")]; return rows[0].querySelector(".terminal-current-model") === null && rows[1].querySelector(".terminal-current-model")?.textContent.includes("Gemini 3.8 Flash") })()'
    Invoke-Portal select @('select[aria-label="Ordenar terminais"]', 'Latência da leitura') | Out-Null
    Assert-Portal "$size orders terminals by measured latency" '(() => { const readings = [...document.querySelectorAll(".terminal-inspection-latency")].map(el => parseInt(el.textContent)); return readings.length > 1 && readings.every((value, i) => i === 0 || value >= readings[i - 1]) })()'
    Invoke-Portal click @('.terminal-actions > button') | Out-Null
    Assert-Portal "$size buffer opens" 'Boolean(document.querySelector(".terminal-buffer-dialog[open] pre")?.textContent?.trim())'
    Invoke-Portal click @('.terminal-buffer-dialog form button') | Out-Null
    Assert-Portal "$size buffer closes" '!document.querySelector(".terminal-buffer-dialog[open]")'

    Invoke-Portal click @('.nav-tab:nth-child(3)') | Out-Null
    Assert-Portal "$size settings ratio" '(() => { const grid = [...document.querySelector(".settings-split-layout").children]; const a = grid[0].getBoundingClientRect().width; const b = grid[1].getBoundingClientRect().width; return Math.abs(a / (a + b) - 0.45) < 0.01 })()'
    Assert-Portal "$size logs fit" 'document.querySelector(".main-view").scrollWidth === document.querySelector(".main-view").clientWidth'
  }

  Invoke-Portal click @('.logs-header-actions button:last-child') | Out-Null
  Assert-Portal 'clear logs asks for confirmation' 'Boolean(document.querySelector(".logs-clear-confirm")) && document.querySelectorAll(".log-entry").length > 0'
  Invoke-Portal click @('.logs-clear-confirm button:first-of-type') | Out-Null
  Assert-Portal 'cancel preserves preview logs' '!document.querySelector(".logs-clear-confirm") && document.querySelectorAll(".log-entry").length > 0'
  Invoke-Portal click @('.logs-header-actions button:last-child') | Out-Null
  Invoke-Portal click @('.logs-clear-confirm button:last-child') | Out-Null
  Assert-Portal 'confirm clears only demo logs' '!window.relay && document.querySelectorAll(".log-entry").length === 0'
  Assert-Portal 'Geist loads locally' 'document.fonts.check("12px Geist Variable") && document.fonts.check("12px Geist Mono Variable") && [...document.fonts].some(f => f.family.includes("Geist Mono") && f.status === "loaded")'
} finally {
  Invoke-Portal resize @('1900', '1192') | Out-Null
  Invoke-Portal navigate @($Url) | Out-Null
}
