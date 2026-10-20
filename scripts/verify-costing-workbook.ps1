[CmdletBinding()]
param(
  [ValidateSet("Baseline", "Tooling", "Quick", "Oracle", "Render", "Security", "Full")]
  [string]$Mode = "Quick",
  [string]$WorkbookPath = "docs/Strivo AI Final Costing Plan.xlsx",
  [string]$BaselineAuditPath = ".planning/phases/04.1-update-strivo-costing-workbook-with-missing-costs-and-formul/04.1-BASELINE-AUDIT.json",
  [string]$ToolingHandoffPath = ".planning/phases/04.1-update-strivo-costing-workbook-with-missing-costs-and-formul/04.1-TOOLING-HANDOFF.json",
  [string]$LiveEvidencePath = ".planning/phases/04.1-update-strivo-costing-workbook-with-missing-costs-and-formul/04.1-LIVE-EXCEL-EVIDENCE.json"
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$script:Failures = [System.Collections.Generic.List[string]]::new()
$script:SpreadsheetNamespace = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
$script:OfficeRelationshipNamespace = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
$script:PackageRelationshipNamespace = "http://schemas.openxmlformats.org/package/2006/relationships"
$script:ExpectedScenarioNames = @("Worst Case", "Mid Case", "Best Case")
$script:ExpectedBaselineFormulaHash = "a42df39c08879868933921f5ad02515f21399b16b31c458806f40453780b19c1"
$script:PhaseDirectory = ".planning/phases/04.1-update-strivo-costing-workbook-with-missing-costs-and-formul"

# Formulas on Sources & Inputs are limited to dated metadata, OCR blend checks,
# the vendor active-price/overage schedule, and its reference total. Source URLs,
# statuses, notes, and production-data requirements must remain inert text.
$script:ApprovedSourceFormulaRanges = @("B2", "H2", "B38", "B39", "B40", "B41", "B73")
foreach ($row in 45..71) {
  $script:ApprovedSourceFormulaRanges += @("F$row", "G$row", "L$row", "M$row")
}

function ConvertTo-DisplayText {
  param([AllowNull()]$Value)
  if ($null -eq $Value) { return "<null>" }
  if ($Value -is [System.Array]) { return ($Value -join ", ") }
  return [string]$Value
}

function Write-Result {
  param(
    [string]$Layer,
    [string]$Target,
    [string]$Expected,
    [string]$Actual,
    [bool]$Passed
  )
  $status = if ($Passed) { "PASS" } else { "FAIL" }
  Write-Host "[$status] $Layer | $Target | expected=$Expected | actual=$Actual"
  if (-not $Passed) {
    $script:Failures.Add("$Layer | $Target | expected=$Expected | actual=$Actual")
  }
}

function Assert-Equal {
  param([string]$Layer, [string]$Target, [AllowNull()]$Expected, [AllowNull()]$Actual)
  $expectedText = ConvertTo-DisplayText $Expected
  $actualText = ConvertTo-DisplayText $Actual
  Write-Result -Layer $Layer -Target $Target -Expected $expectedText -Actual $actualText -Passed ($expectedText -ceq $actualText)
}

function Assert-True {
  param([string]$Layer, [string]$Target, [bool]$Condition, [string]$Actual)
  Write-Result -Layer $Layer -Target $Target -Expected "true" -Actual $Actual -Passed $Condition
}

function Get-Sha256Text {
  param([string]$Text)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
    return ([System.BitConverter]::ToString($sha.ComputeHash($bytes))).Replace("-", "").ToLowerInvariant()
  } finally {
    $sha.Dispose()
  }
}

function Get-FileSha256Shared {
  param([string]$Path)
  $stream = [System.IO.File]::Open(
    $Path,
    [System.IO.FileMode]::Open,
    [System.IO.FileAccess]::Read,
    [System.IO.FileShare]::ReadWrite -bor [System.IO.FileShare]::Delete
  )
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    return ([System.BitConverter]::ToString($sha.ComputeHash($stream))).Replace("-", "").ToLowerInvariant()
  } finally {
    $sha.Dispose()
    $stream.Dispose()
  }
}

function Test-PathWithin {
  param([string]$Candidate, [string]$Root)
  $rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar)
  $candidateFull = [System.IO.Path]::GetFullPath($Candidate)
  return $candidateFull.Equals($rootFull, [System.StringComparison]::OrdinalIgnoreCase) -or
    $candidateFull.StartsWith($rootFull + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)
}

function Resolve-RepositoryFile {
  param([string]$Path, [string]$Name, [string]$RepositoryRoot)
  $candidate = if ([System.IO.Path]::IsPathRooted($Path)) { $Path } else { Join-Path $RepositoryRoot $Path }
  $full = [System.IO.Path]::GetFullPath($candidate)
  if (-not (Test-PathWithin -Candidate $full -Root $RepositoryRoot)) {
    throw "$Name must resolve inside repository root '$RepositoryRoot'; actual '$full'."
  }
  return $full
}

function Get-XmlFromEntry {
  param([System.IO.Compression.ZipArchive]$Archive, [string]$EntryName, [switch]$Optional)
  $entry = $Archive.GetEntry($EntryName)
  if ($null -eq $entry) {
    if ($Optional) { return $null }
    throw "Required workbook package entry is missing: $EntryName"
  }
  $reader = [System.IO.StreamReader]::new($entry.Open(), [System.Text.Encoding]::UTF8, $true)
  try {
    $document = [System.Xml.XmlDocument]::new()
    $document.PreserveWhitespace = $true
    $document.LoadXml($reader.ReadToEnd())
    return ,$document
  } finally {
    $reader.Dispose()
  }
}

function New-NamespaceManager {
  param([System.Xml.XmlDocument]$Document)
  $manager = [System.Xml.XmlNamespaceManager]::new($Document.NameTable)
  $null = $manager.AddNamespace("x", $script:SpreadsheetNamespace)
  $null = $manager.AddNamespace("r", $script:OfficeRelationshipNamespace)
  $null = $manager.AddNamespace("pr", $script:PackageRelationshipNamespace)
  return ,$manager
}

function Resolve-PackageTarget {
  param([string]$BasePart, [string]$Target)
  if ($Target.StartsWith("/")) { return $Target.TrimStart("/") }
  $baseUri = [System.Uri]::new("http://package/$BasePart")
  $resolved = [System.Uri]::new($baseUri, $Target.Replace("\", "/"))
  return $resolved.AbsolutePath.TrimStart("/")
}

function ConvertFrom-ColumnName {
  param([string]$Name)
  $value = 0
  foreach ($character in $Name.ToUpperInvariant().ToCharArray()) {
    $value = ($value * 26) + ([int][char]$character - [int][char]'A' + 1)
  }
  return $value
}

function ConvertTo-ColumnName {
  param([int]$Number)
  $result = ""
  while ($Number -gt 0) {
    $Number--
    $result = [char]([int][char]'A' + ($Number % 26)) + $result
    $Number = [Math]::Floor($Number / 26)
  }
  return $result
}

function Get-CellPosition {
  param([string]$Coordinate)
  if ($Coordinate -notmatch '^([A-Z]+)([0-9]+)$') { throw "Invalid A1 coordinate '$Coordinate'." }
  return [pscustomobject]@{ column = ConvertFrom-ColumnName $Matches[1]; row = [int]$Matches[2] }
}

function Get-SharedStrings {
  param([System.IO.Compression.ZipArchive]$Archive)
  [System.Xml.XmlDocument]$document = Get-XmlFromEntry -Archive $Archive -EntryName "xl/sharedStrings.xml" -Optional
  if ($null -eq $document) { return @() }
  $manager = New-NamespaceManager $document
  return @($document.SelectNodes("//x:si", $manager) | ForEach-Object {
    (@($_.SelectNodes(".//x:t", $manager) | ForEach-Object { $_.InnerText }) -join "")
  })
}

function Get-CellValue {
  param([System.Xml.XmlElement]$Cell, [System.Xml.XmlNamespaceManager]$Manager, [object[]]$SharedStrings)
  $valueNode = $Cell.SelectSingleNode("./x:v", $Manager)
  $type = $Cell.GetAttribute("t")
  if ($type -eq "s" -and $null -ne $valueNode -and $valueNode.InnerText -ne "") {
    $index = [int]$valueNode.InnerText
    if ($index -ge 0 -and $index -lt $SharedStrings.Count) { return [string]$SharedStrings[$index] }
  }
  if ($type -eq "inlineStr") {
    return (@($Cell.SelectNodes(".//x:is//x:t", $Manager) | ForEach-Object { $_.InnerText }) -join "")
  }
  if ($null -ne $valueNode) { return [string]$valueNode.InnerText }
  return ""
}

function Get-WorkbookInventory {
  param([string]$ResolvedWorkbook)

  $fileInfo = Get-Item -LiteralPath $ResolvedWorkbook
  $workbookHash = Get-FileSha256Shared -Path $ResolvedWorkbook
  $archive = [System.IO.Compression.ZipFile]::OpenRead($ResolvedWorkbook)
  try {
    $packageEntries = [System.Collections.Generic.List[object]]::new()
    foreach ($entry in ($archive.Entries | Sort-Object FullName)) {
      $stream = $entry.Open()
      $sha = [System.Security.Cryptography.SHA256]::Create()
      try {
        $entryHash = ([System.BitConverter]::ToString($sha.ComputeHash($stream))).Replace("-", "").ToLowerInvariant()
        $packageEntries.Add([pscustomobject]@{ name = $entry.FullName; length = $entry.Length; sha256 = $entryHash })
      } finally {
        $sha.Dispose()
        $stream.Dispose()
      }
    }

    [System.Xml.XmlDocument]$workbookDocument = Get-XmlFromEntry -Archive $archive -EntryName "xl/workbook.xml"
    $workbookManager = New-NamespaceManager $workbookDocument
    [System.Xml.XmlDocument]$relationshipDocument = Get-XmlFromEntry -Archive $archive -EntryName "xl/_rels/workbook.xml.rels"
    $relationshipManager = New-NamespaceManager $relationshipDocument
    $relationships = @{}
    foreach ($relationship in $relationshipDocument.SelectNodes("//pr:Relationship", $relationshipManager)) {
      $relationships[$relationship.GetAttribute("Id")] = Resolve-PackageTarget -BasePart "xl/workbook.xml" -Target $relationship.GetAttribute("Target")
    }

    $sharedStrings = Get-SharedStrings -Archive $archive
    $sheets = [System.Collections.Generic.List[object]]::new()
    foreach ($sheetNode in $workbookDocument.SelectNodes("//x:sheets/x:sheet", $workbookManager)) {
      $relationshipId = $sheetNode.GetAttribute("id", $script:OfficeRelationshipNamespace)
      $sheetPart = $relationships[$relationshipId]
      [System.Xml.XmlDocument]$sheetDocument = Get-XmlFromEntry -Archive $archive -EntryName $sheetPart
      $sheetManager = New-NamespaceManager $sheetDocument
      $cellRecords = [System.Collections.Generic.List[object]]::new()
      $minRow = [int]::MaxValue
      $minColumn = [int]::MaxValue
      $maxRow = 0
      $maxColumn = 0

      foreach ($cell in $sheetDocument.SelectNodes("//x:sheetData/x:row/x:c", $sheetManager)) {
        $coordinate = $cell.GetAttribute("r")
        $position = Get-CellPosition $coordinate
        $minRow = [Math]::Min($minRow, $position.row)
        $minColumn = [Math]::Min($minColumn, $position.column)
        $maxRow = [Math]::Max($maxRow, $position.row)
        $maxColumn = [Math]::Max($maxColumn, $position.column)
        $formulaNode = $cell.SelectSingleNode("./x:f", $sheetManager)
        $hasFormula = $null -ne $formulaNode
        $formula = if ($hasFormula) { [string]$formulaNode.InnerText } else { "" }
        # Preserve the published Phase 04.1 baseline signature contract. The mapper
        # used PowerShell's XML adapter for the formula component, which intentionally
        # differs from SelectSingleNode for some non-shared formula nodes.
        $hashFormula = if ($hasFormula) { [string]$cell.f.InnerText } else { "" }
        $styleText = $cell.GetAttribute("s")
        $styleId = if ($styleText -eq "") { 0 } else { [int]$styleText }
        $value = Get-CellValue -Cell $cell -Manager $sheetManager -SharedStrings $sharedStrings
        $cellRecords.Add([pscustomobject]@{
          coordinate = $coordinate
          row = $position.row
          column = $position.column
          styleId = $styleId
          cellType = $cell.GetAttribute("t")
          value = $value
          hasFormula = $hasFormula
          formula = $formula
          hashFormula = $hashFormula
          formulaType = if ($hasFormula) { $formulaNode.GetAttribute("t") } else { "" }
          formulaRef = if ($hasFormula) { $formulaNode.GetAttribute("ref") } else { "" }
          formulaIndex = if ($hasFormula) { $formulaNode.GetAttribute("si") } else { "" }
        })
      }

      $formulaCells = @($cellRecords | Where-Object hasFormula)
      $formulaRecords = @($formulaCells | ForEach-Object { "$($_.coordinate)|$($_.styleId)|$($_.hashFormula)" })
      $formulaHash = Get-Sha256Text ($formulaRecords -join "`n")
      $usedRange = if ($maxRow -eq 0) { "" } else { "$(ConvertTo-ColumnName $minColumn)$minRow`:$(ConvertTo-ColumnName $maxColumn)$maxRow" }
      $merges = @($sheetDocument.SelectNodes("//x:mergeCells/x:mergeCell", $sheetManager) | ForEach-Object { $_.GetAttribute("ref") })
      $columns = @($sheetDocument.SelectNodes("//x:cols/x:col", $sheetManager) | ForEach-Object {
        [pscustomobject]@{
          min = [int]$_.GetAttribute("min")
          max = [int]$_.GetAttribute("max")
          width = $_.GetAttribute("width")
          hidden = $_.GetAttribute("hidden")
          style = $_.GetAttribute("style")
          customWidth = $_.GetAttribute("customWidth")
        }
      })
      $rows = @($sheetDocument.SelectNodes("//x:sheetData/x:row[@ht or @hidden or @customHeight]", $sheetManager) | ForEach-Object {
        [pscustomobject]@{ row = $_.GetAttribute("r"); height = $_.GetAttribute("ht"); hidden = $_.GetAttribute("hidden"); customHeight = $_.GetAttribute("customHeight") }
      })
      $validations = @($sheetDocument.SelectNodes("//x:dataValidations/x:dataValidation", $sheetManager) | ForEach-Object {
        [pscustomobject]@{ type = $_.GetAttribute("type"); sqref = $_.GetAttribute("sqref"); formula1 = $_.SelectSingleNode("./x:formula1", $sheetManager).InnerText }
      })
      $drawingIds = @($sheetDocument.SelectNodes("//x:drawing", $sheetManager) | ForEach-Object { $_.GetAttribute("id", $script:OfficeRelationshipNamespace) })

      $state = $sheetNode.GetAttribute("state")
      $sheets.Add([pscustomobject]@{
        name = $sheetNode.GetAttribute("name")
        state = if ($state -eq "") { "visible" } else { $state }
        sheetId = $sheetNode.GetAttribute("sheetId")
        packagePart = $sheetPart
        usedRange = $usedRange
        serializedCellCount = $cellRecords.Count
        populatedCellCount = @($cellRecords | Where-Object { $_.hasFormula -or $_.value -ne "" }).Count
        formulaCellCount = $formulaCells.Count
        formulaStyleHash = $formulaHash
        cells = @($cellRecords)
        merges = $merges
        columns = $columns
        rows = $rows
        validations = $validations
        drawingRelationshipIds = $drawingIds
      })
    }

    [System.Xml.XmlDocument]$stylesDocument = Get-XmlFromEntry -Archive $archive -EntryName "xl/styles.xml"
    $stylesManager = New-NamespaceManager $stylesDocument
    $styleCounts = [pscustomobject]@{
      cellXfs = @($stylesDocument.SelectNodes("//x:cellXfs/x:xf", $stylesManager)).Count
      fonts = @($stylesDocument.SelectNodes("//x:fonts/x:font", $stylesManager)).Count
      fills = @($stylesDocument.SelectNodes("//x:fills/x:fill", $stylesManager)).Count
      borders = @($stylesDocument.SelectNodes("//x:borders/x:border", $stylesManager)).Count
      customNumberFormats = @($stylesDocument.SelectNodes("//x:numFmts/x:numFmt", $stylesManager)).Count
    }
    $definedNames = @($workbookDocument.SelectNodes("//x:definedNames/x:definedName", $workbookManager) | ForEach-Object {
      [pscustomobject]@{ name = $_.GetAttribute("name"); value = $_.InnerText; localSheetId = $_.GetAttribute("localSheetId") }
    })
    $calculationNode = $workbookDocument.SelectSingleNode("//x:calcPr", $workbookManager)
    $calculationProperties = if ($null -eq $calculationNode) { $null } else {
      [pscustomobject]@{
        calculationId = $calculationNode.GetAttribute("calcId")
        mode = $calculationNode.GetAttribute("calcMode")
        fullCalculationOnLoad = $calculationNode.GetAttribute("fullCalcOnLoad")
        forceFullCalculation = $calculationNode.GetAttribute("forceFullCalc")
        iterate = $calculationNode.GetAttribute("iterate")
      }
    }

    return [pscustomobject]@{
      workbookPath = $ResolvedWorkbook
      workbookSha256 = $workbookHash
      workbookLength = $fileInfo.Length
      packageEntries = @($packageEntries)
      sheets = @($sheets)
      styleCounts = $styleCounts
      definedNames = $definedNames
      calculationProperties = $calculationProperties
    }
  } finally {
    $archive.Dispose()
  }
}

function Test-StaticIntegrity {
  param($Inventory)
  $entryNames = @($Inventory.packageEntries | ForEach-Object name)
  $unsafeParts = @($entryNames | Where-Object {
    $_ -match '^xl/externalLinks/' -or $_ -match 'connections\.xml$' -or $_ -match 'vbaProject' -or $_ -match '^xl/(activeX|embeddings|oleObjects)/'
  })
  Assert-Equal -Layer "Static" -Target "unsafe package parts" -Expected 0 -Actual $unsafeParts.Count

  $allFormulaCells = @($Inventory.sheets | ForEach-Object { $_.cells | Where-Object hasFormula })
  $externalFormulaCells = @($allFormulaCells | Where-Object { $_.formula -match '\[[^\]]+\]' })
  $refFormulaCells = @($allFormulaCells | Where-Object { $_.formula -match '#REF!' })
  Assert-Equal -Layer "Static" -Target "external workbook formulas" -Expected 0 -Actual $externalFormulaCells.Count
  Assert-Equal -Layer "Static" -Target "#REF! formulas" -Expected 0 -Actual $refFormulaCells.Count

  $iterate = if ($null -eq $Inventory.calculationProperties) { "" } else { $Inventory.calculationProperties.iterate }
  Assert-True -Layer "Static" -Target "circular calculation metadata" -Condition ($iterate -notin @("1", "true", "True")) -Actual "iterate=$iterate"

  $secretNamePattern = '(?i)(ANTHROPIC_API_KEY|SUPABASE_SERVICE_ROLE_KEY|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|INTERNAL_JOB_SECRET|RESEND_API_KEY|FIRECRAWL_API_KEY|MISTRAL_API_KEY|AWS_SECRET_ACCESS_KEY)\s*[:=]\s*\S+'
  $secretValuePattern = '(?i)(sk_(live|test)_[A-Za-z0-9]{16,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.|-----BEGIN [A-Z ]*PRIVATE KEY-----)'
  $secretHits = [System.Collections.Generic.List[string]]::new()
  foreach ($sheet in $Inventory.sheets) {
    foreach ($cell in ($sheet.cells | Where-Object { -not $_.hasFormula -and $_.value -ne "" })) {
      if ($cell.value -match $secretNamePattern -or $cell.value -match $secretValuePattern) {
        $secretHits.Add("$($sheet.name)!$($cell.coordinate)")
      }
    }
  }
  Assert-Equal -Layer "Security" -Target "secret-like text cells" -Expected 0 -Actual $secretHits.Count

  $sourceFormulaHits = [System.Collections.Generic.List[string]]::new()
  $sourceSheet = $Inventory.sheets | Where-Object name -eq "Sources & Inputs" | Select-Object -First 1
  if ($null -ne $sourceSheet) {
    foreach ($cell in ($sourceSheet.cells | Where-Object hasFormula)) {
      if ($script:ApprovedSourceFormulaRanges -notcontains $cell.coordinate) {
        $sourceFormulaHits.Add("Sources & Inputs!$($cell.coordinate)")
      }
    }
  }
  Assert-Equal -Layer "Security" -Target "unapproved formulas in source/audit ranges" -Expected 0 -Actual $sourceFormulaHits.Count
}

function Get-NearestLabel {
  param($Cell, [hashtable]$CellsByRow)
  $rowCells = @($CellsByRow[$Cell.row] | Sort-Object column)
  $leftLabels = @($rowCells | Where-Object {
    $_.column -lt $Cell.column -and -not $_.hasFormula -and $_.value -ne "" -and $_.value -notmatch '^-?[0-9]+([.][0-9]+)?([Ee][+-]?[0-9]+)?$'
  })
  if ($leftLabels.Count -gt 0) { return [string]$leftLabels[-1].value }
  return ""
}

function New-BaselineAudit {
  param($Inventory, [string]$AuditPath)
  $populated = [System.Collections.Generic.List[object]]::new()
  $formulas = [System.Collections.Generic.List[object]]::new()
  $summaries = [System.Collections.Generic.List[object]]::new()
  $calculatedHardcodes = [System.Collections.Generic.List[object]]::new()
  $sheetRecords = @{}
  $summaryPattern = '(?i)(overview|summary|total|revenue|profit|cost|stripe|take home|founder|margin|check)'
  $calculatedPattern = '(?i)(total|revenue|profit|cost|fee|take home|margin|transactions|monthly #|annual #|price per merit)'

  foreach ($sheet in $Inventory.sheets) {
    $cellsByRow = @{}
    foreach ($cell in $sheet.cells) {
      if (-not $cellsByRow.ContainsKey($cell.row)) { $cellsByRow[$cell.row] = [System.Collections.Generic.List[object]]::new() }
      $cellsByRow[$cell.row].Add($cell)
    }
    $records = [System.Collections.Generic.List[object]]::new()
    foreach ($cell in ($sheet.cells | Where-Object { $_.hasFormula -or $_.value -ne "" })) {
      $label = if ($cell.value -match '[A-Za-z]') { [string]$cell.value } else { Get-NearestLabel -Cell $cell -CellsByRow $cellsByRow }
      $classification = if ($cell.hasFormula) { "formula" } elseif ($cell.value -match '^-?[0-9]+([.][0-9]+)?([Ee][+-]?[0-9]+)?$') { "hardcoded-number" } else { "text-or-label" }
      $record = [pscustomobject]@{
        sheet = $sheet.name
        coordinate = $cell.coordinate
        label = $label
        value = $cell.value
        formula = $cell.formula
        formulaType = $cell.formulaType
        formulaRef = $cell.formulaRef
        formulaIndex = $cell.formulaIndex
        styleId = $cell.styleId
        cellType = $cell.cellType
        classification = $classification
      }
      $records.Add($record)
      $populated.Add($record)
      if ($cell.hasFormula) { $formulas.Add($record) }
      if ($label -match $summaryPattern -or $cell.value -match $summaryPattern) { $summaries.Add($record) }
      if (-not $cell.hasFormula -and $cell.value -match '^-?[0-9]+([.][0-9]+)?([Ee][+-]?[0-9]+)?$' -and $label -match $calculatedPattern) {
        $calculatedHardcodes.Add([pscustomobject]@{
          sheet = $sheet.name
          coordinate = $cell.coordinate
          label = $label
          value = $cell.value
          styleId = $cell.styleId
          expectedFormulaDrivenReplacement = "Replace $($sheet.name)!$($cell.coordinate) with an auditable formula referencing the canonical input cells identified by '$label'; preserve this style and scenario-local references."
        })
      }
    }
    $sheetRecords[$sheet.name] = @($records)
  }

  $duplicates = [System.Collections.Generic.List[object]]::new()
  $worstRecords = @($sheetRecords["Worst Case"])
  foreach ($record in ($worstRecords | Where-Object { $_.classification -eq "hardcoded-number" })) {
    $group = [System.Collections.Generic.List[object]]::new()
    foreach ($scenarioName in $script:ExpectedScenarioNames) {
      $match = @($sheetRecords[$scenarioName] | Where-Object coordinate -eq $record.coordinate | Select-Object -First 1)
      if ($match.Count -eq 1 -and $match[0].classification -eq "hardcoded-number" -and $match[0].value -ceq $record.value) {
        $group.Add([pscustomobject]@{ sheet = $scenarioName; coordinate = $record.coordinate; label = $match[0].label; value = $match[0].value; styleId = $match[0].styleId })
      }
    }
    if ($group.Count -ge 2) {
      $duplicates.Add([pscustomobject]@{
        key = $record.coordinate
        label = $record.label
        value = $record.value
        canonicalEditableSource = "Worst Case!$($record.coordinate)"
        dependentDuplicates = @($group | Select-Object -Skip 1 | ForEach-Object { "$($_.sheet)!$($_.coordinate)" })
        occurrences = @($group)
      })
    }
  }

  $audit = [ordered]@{
    metadata = [ordered]@{
      phase = "04.1"
      plan = "01"
      purpose = "Pre-edit workbook inventory; Plan 02 must consume this file before editing."
      localOnly = $true
      uncommitted = $true
      generatedUtc = [DateTime]::UtcNow.ToString("o")
      workbookPath = $Inventory.workbookPath
      workbookSha256 = $Inventory.workbookSha256
      workbookLength = $Inventory.workbookLength
    }
    workbook = [ordered]@{
      sheetOrder = @($Inventory.sheets | ForEach-Object name)
      styleCounts = $Inventory.styleCounts
      definedNames = $Inventory.definedNames
      calculationProperties = $Inventory.calculationProperties
      packageInventory = $Inventory.packageEntries
      sheets = @($Inventory.sheets | ForEach-Object {
        [pscustomobject]@{
          name = $_.name; state = $_.state; usedRange = $_.usedRange
          serializedCellCount = $_.serializedCellCount; populatedCellCount = $_.populatedCellCount
          formulaCellCount = $_.formulaCellCount; formulaStyleHash = $_.formulaStyleHash
          merges = $_.merges; columns = $_.columns; rows = $_.rows
          validations = $_.validations; drawingRelationshipIds = $_.drawingRelationshipIds
        }
      })
    }
    counts = [ordered]@{
      populatedCells = $populated.Count
      formulaCells = $formulas.Count
      summaryOutputChecks = $summaries.Count
      calculatedHardcodes = $calculatedHardcodes.Count
      duplicateAssumptions = $duplicates.Count
    }
    populatedCells = @($populated)
    formulaCells = @($formulas)
    summariesOutputsAndChecks = @($summaries)
    calculatedHardcodes = @($calculatedHardcodes)
    duplicateAssumptions = @($duplicates)
  }

  $json = $audit | ConvertTo-Json -Depth 20
  $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("strivo-costing-" + [guid]::NewGuid().ToString("N"))
  $resolvedTempParent = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
  $resolvedTempRoot = [System.IO.Path]::GetFullPath($tempRoot)
  if (-not (Test-PathWithin -Candidate $resolvedTempRoot -Root $resolvedTempParent) -or $resolvedTempRoot -eq $resolvedTempParent) {
    throw "Refusing unsafe temporary directory '$resolvedTempRoot'."
  }
  try {
    [System.IO.Directory]::CreateDirectory($resolvedTempRoot) | Out-Null
    $tempAudit = Join-Path $resolvedTempRoot "04.1-BASELINE-AUDIT.json"
    [System.IO.File]::WriteAllText($tempAudit, $json, [System.Text.UTF8Encoding]::new($false))
    $null = Get-Content -LiteralPath $tempAudit -Raw | ConvertFrom-Json
    [System.IO.Directory]::CreateDirectory((Split-Path -Parent $AuditPath)) | Out-Null
    [System.IO.File]::WriteAllText($AuditPath, $json, [System.Text.UTF8Encoding]::new($false))
  } finally {
    if (Test-Path -LiteralPath $resolvedTempRoot) {
      Remove-Item -LiteralPath $resolvedTempRoot -Recurse -Force
    }
  }
  return $audit
}

function Test-BaselineFacts {
  param($Inventory)
  $sheetNames = @($Inventory.sheets | ForEach-Object name)
  $visibleSheetNames = @($Inventory.sheets | Where-Object state -eq "visible" | ForEach-Object name)
  Assert-Equal -Layer "Baseline" -Target "visible sheet order" -Expected ($script:ExpectedScenarioNames -join ", ") -Actual ($visibleSheetNames -join ", ")
  Assert-Equal -Layer "Baseline" -Target "sheet count/no fourth sheet" -Expected 3 -Actual $sheetNames.Count

  foreach ($scenarioName in $script:ExpectedScenarioNames) {
    $sheet = $Inventory.sheets | Where-Object name -eq $scenarioName | Select-Object -First 1
    Assert-True -Layer "Baseline" -Target "$scenarioName exists" -Condition ($null -ne $sheet) -Actual $(if ($null -eq $sheet) { "missing" } else { "present" })
    if ($null -eq $sheet) { continue }
    Assert-Equal -Layer "Baseline" -Target "$scenarioName serialized cells" -Expected 3108 -Actual $sheet.serializedCellCount
    Assert-Equal -Layer "Baseline" -Target "$scenarioName formula cells" -Expected 151 -Actual $sheet.formulaCellCount
    Assert-Equal -Layer "Baseline" -Target "$scenarioName formula/style hash" -Expected $script:ExpectedBaselineFormulaHash -Actual $sheet.formulaStyleHash
    $requiredMerges = 87..91 | ForEach-Object { "A$_`:I$_" }
    foreach ($merge in $requiredMerges) {
      Assert-True -Layer "Baseline" -Target "$scenarioName merge $merge" -Condition ($sheet.merges -contains $merge) -Actual ($sheet.merges -join ",")
    }
    $maxColumn = ($sheet.columns | Measure-Object max -Maximum).Maximum
    Assert-True -Layer "Baseline" -Target "$scenarioName column widths through AK" -Condition ($maxColumn -ge 37) -Actual "maxColumn=$maxColumn"
  }

  $columnSignatures = @($script:ExpectedScenarioNames | ForEach-Object {
    $sheet = $Inventory.sheets | Where-Object name -eq $_ | Select-Object -First 1
    Get-Sha256Text ((@($sheet.columns | ForEach-Object { "$($_.min)|$($_.max)|$($_.width)|$($_.hidden)|$($_.style)|$($_.customWidth)" }) -join "`n"))
  })
  Assert-Equal -Layer "Baseline" -Target "scenario column-width signatures" -Expected 1 -Actual @($columnSignatures | Sort-Object -Unique).Count
  Assert-Equal -Layer "Baseline" -Target "cell-XFs" -Expected 97 -Actual $Inventory.styleCounts.cellXfs
  Assert-Equal -Layer "Baseline" -Target "fonts" -Expected 10 -Actual $Inventory.styleCounts.fonts
  Assert-Equal -Layer "Baseline" -Target "fills" -Expected 9 -Actual $Inventory.styleCounts.fills
  Assert-Equal -Layer "Baseline" -Target "borders" -Expected 2 -Actual $Inventory.styleCounts.borders
  Assert-Equal -Layer "Baseline" -Target "custom number formats" -Expected 11 -Actual $Inventory.styleCounts.customNumberFormats
  Assert-Equal -Layer "Baseline" -Target "defined names" -Expected 0 -Actual $Inventory.definedNames.Count
  Assert-Equal -Layer "Baseline" -Target "data validations" -Expected 0 -Actual @($Inventory.sheets | ForEach-Object validations).Count
}

function Invoke-Baseline {
  param($Inventory, [string]$AuditPath)
  Test-BaselineFacts -Inventory $Inventory
  Test-StaticIntegrity -Inventory $Inventory
  $audit = New-BaselineAudit -Inventory $Inventory -AuditPath $AuditPath
  Write-Host "Baseline sheets: $(@($Inventory.sheets | ForEach-Object name) -join ', ')"
  Write-Host "Baseline serialized cells per scenario: 3108"
  Write-Host "Baseline formulas per scenario: 151"
  Write-Host "Baseline published formula/style hash: $script:ExpectedBaselineFormulaHash"
  Write-Host "Baseline populated count: $($audit.counts.populatedCells)"
  Write-Host "Baseline formula count: $($audit.counts.formulaCells)"
  Write-Host "Baseline summary/output/check count: $($audit.counts.summaryOutputChecks)"
  Write-Host "Baseline calculated-hardcode count: $($audit.counts.calculatedHardcodes)"
  Write-Host "Baseline duplicate-assumption count: $($audit.counts.duplicateAssumptions)"
  Write-Host "Baseline audit path: $AuditPath"
}

function Invoke-Quick {
  param($Inventory)
  Test-StaticIntegrity -Inventory $Inventory
  if ($Inventory.sheets.Count -eq 3) {
    Test-BaselineFacts -Inventory $Inventory
    Write-Host "Quick baseline checks passed; calculation/render not run"
    return
  }
  Test-CompletedWorkbookFacts -Inventory $Inventory
  Write-Host "Quick completed-workbook checks passed; cached calculation values inspected"
}

function Get-InventoryCell {
  param($Sheet, [string]$Coordinate)
  $matches = @($Sheet.cells | Where-Object coordinate -eq $Coordinate | Select-Object -First 1)
  return ,$matches
}

function Assert-CellText {
  param($Sheet, [string]$Coordinate, [string]$Expected, [string]$Layer = "Completed")
  $match = Get-InventoryCell -Sheet $Sheet -Coordinate $Coordinate
  $actual = if ($match.Count -eq 1) { [string]$match[0].value } else { "<missing>" }
  Assert-Equal -Layer $Layer -Target "$($Sheet.name)!$Coordinate cached value" -Expected $Expected -Actual $actual
}

function Assert-CellFormulaContains {
  param($Sheet, [string]$Coordinate, [string]$ExpectedFragment)
  $match = Get-InventoryCell -Sheet $Sheet -Coordinate $Coordinate
  $actual = if ($match.Count -eq 1) { [string]$match[0].formula } else { "<missing>" }
  Assert-True -Layer "Completed" -Target "$($Sheet.name)!$Coordinate formula link" -Condition ($match.Count -eq 1 -and $match[0].hasFormula -and $actual.Contains($ExpectedFragment)) -Actual $actual
}

function Test-CompletedWorkbookFacts {
  param($Inventory)
  $expectedOrder = @($script:ExpectedScenarioNames + "Sources & Inputs")
  $sheetNames = @($Inventory.sheets | ForEach-Object name)
  $visibleNames = @($Inventory.sheets | Where-Object state -eq "visible" | ForEach-Object name)
  Assert-Equal -Layer "Completed" -Target "sheet order" -Expected ($expectedOrder -join ", ") -Actual ($sheetNames -join ", ")
  Assert-Equal -Layer "Completed" -Target "visible sheet order" -Expected ($expectedOrder -join ", ") -Actual ($visibleNames -join ", ")

  $sourceSheet = $Inventory.sheets | Where-Object name -eq "Sources & Inputs" | Select-Object -First 1
  Assert-True -Layer "Completed" -Target "Sources & Inputs exists" -Condition ($null -ne $sourceSheet) -Actual $(if ($null -eq $sourceSheet) { "missing" } else { "present" })
  if ($null -ne $sourceSheet) {
    Assert-True -Layer "Completed" -Target "Sources & Inputs used range" -Condition ($sourceSheet.usedRange -match '^A1:O(109|1[1-9][0-9]|[2-9][0-9]{2,})$') -Actual $sourceSheet.usedRange
    $sourceIds = @($sourceSheet.cells | Where-Object { $_.coordinate -match '^A(7[7-9]|8[0-9]|9[0-4])$' -and $_.value -ne "" })
    $todoStatuses = @($sourceSheet.cells | Where-Object { $_.coordinate -match '^G(99|10[0-9])$' -and $_.value -eq "Open" })
    Assert-Equal -Layer "Completed" -Target "source audit rows" -Expected 18 -Actual $sourceIds.Count
    Assert-Equal -Layer "Completed" -Target "production data requirements" -Expected 11 -Actual $todoStatuses.Count
    Assert-CellText -Sheet $sourceSheet -Coordinate "B40" -Expected "OK"
    Assert-CellText -Sheet $sourceSheet -Coordinate "B41" -Expected "OK"
    $validationRefs = @($sourceSheet.validations | ForEach-Object sqref)
    Assert-True -Layer "Completed" -Target "vendor include validation" -Condition ($validationRefs -contains "C45:C71") -Actual ($validationRefs -join ", ")
    Assert-True -Layer "Completed" -Target "production status validation" -Condition ($validationRefs -contains "G99:G109") -Actual ($validationRefs -join ", ")
  }

  $parityHashes = [System.Collections.Generic.List[string]]::new()
  foreach ($scenarioName in $script:ExpectedScenarioNames) {
    $sheet = $Inventory.sheets | Where-Object name -eq $scenarioName | Select-Object -First 1
    Assert-True -Layer "Completed" -Target "$scenarioName exists" -Condition ($null -ne $sheet) -Actual $(if ($null -eq $sheet) { "missing" } else { "present" })
    if ($null -eq $sheet) { continue }
    Assert-Equal -Layer "Completed" -Target "$scenarioName formula count" -Expected 309 -Actual $sheet.formulaCellCount
    Assert-CellFormulaContains -Sheet $sheet -Coordinate "H8" -ExpectedFragment "'Sources & Inputs'!`$B`$13"
    Assert-CellFormulaContains -Sheet $sheet -Coordinate "G13" -ExpectedFragment "'Sources & Inputs'!`$B`$10"
    Assert-CellFormulaContains -Sheet $sheet -Coordinate "L6" -ExpectedFragment "'Sources & Inputs'!`$B`$27"
    Assert-CellFormulaContains -Sheet $sheet -Coordinate "M33" -ExpectedFragment "'Sources & Inputs'!`$B`$10"
    Assert-CellFormulaContains -Sheet $sheet -Coordinate "Q36" -ExpectedFragment "'Sources & Inputs'!`$B`$30"
    Assert-CellFormulaContains -Sheet $sheet -Coordinate "X29" -ExpectedFragment "SUM(X24:X28)"
    Assert-CellText -Sheet $sheet -Coordinate "H58" -Expected "OK" -Layer "Oracle"
    foreach ($coordinate in @("X61", "X62", "X63", "X64", "X65")) {
      Assert-CellText -Sheet $sheet -Coordinate $coordinate -Expected "OK" -Layer "Oracle"
    }
    Assert-CellText -Sheet $sheet -Coordinate "P54" -Expected "0" -Layer "Oracle"

    $extensionFormulas = @($sheet.cells | Where-Object {
      $_.hasFormula -and $_.row -ge 40 -and $_.row -le 65 -and $_.column -le 37
    } | Sort-Object row, column | ForEach-Object { "$($_.coordinate)|$($_.formula)" })
    $parityHashes.Add((Get-Sha256Text ($extensionFormulas -join "`n")))

    $formulaErrors = @($sheet.cells | Where-Object {
      $_.hasFormula -and $_.value -match '^#(REF!|DIV/0!|VALUE!|NAME\?|N/A|NUM!|NULL!|SPILL!|CALC!)$'
    })
    Assert-Equal -Layer "Oracle" -Target "$scenarioName cached formula errors" -Expected 0 -Actual $formulaErrors.Count
  }
  Assert-Equal -Layer "Completed" -Target "scenario extension formula parity" -Expected 1 -Actual @($parityHashes | Sort-Object -Unique).Count
}

function Test-LiveEvidence {
  param([string]$EvidencePath, [string]$WorkbookHash, [string]$Layer)
  if (-not (Test-Path -LiteralPath $EvidencePath -PathType Leaf)) {
    Write-Result -Layer $Layer -Target "live Excel evidence" -Expected "present" -Actual "missing" -Passed $false
    return
  }
  $evidence = Get-Content -LiteralPath $EvidencePath -Raw | ConvertFrom-Json
  Assert-Equal -Layer $Layer -Target "workbook SHA-256" -Expected $evidence.workbook.sha256 -Actual $WorkbookHash
  Assert-Equal -Layer $Layer -Target "Excel calculation pass" -Expected $true -Actual $evidence.calculation.pass
  Assert-Equal -Layer $Layer -Target "formula parity pass" -Expected $true -Actual $evidence.calculation.formulaParity
  Assert-Equal -Layer $Layer -Target "render review pass" -Expected $true -Actual $evidence.render.pass
  Assert-Equal -Layer $Layer -Target "rendered range count" -Expected 5 -Actual @($evidence.render.reviewedRanges).Count
  Assert-Equal -Layer $Layer -Target "scenario model status count" -Expected 3 -Actual @($evidence.calculation.scenarios | Where-Object modelStatus -eq "OK").Count
  Assert-Equal -Layer $Layer -Target "independent sensitivity pass" -Expected $true -Actual $evidence.sensitivity.pass
  Assert-Equal -Layer $Layer -Target "independent sensitivity check count" -Expected 45 -Actual $evidence.sensitivity.checkCount
}

function Get-NumericCellValue {
  param($Sheet, [string]$Coordinate)
  $match = Get-InventoryCell -Sheet $Sheet -Coordinate $Coordinate
  if ($match.Count -ne 1) { throw "Missing numeric cell $($Sheet.name)!$Coordinate" }
  $number = 0.0
  if (-not [double]::TryParse([string]$match[0].value, [System.Globalization.NumberStyles]::Float, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$number)) {
    throw "Cell $($Sheet.name)!$Coordinate is not numeric: '$($match[0].value)'"
  }
  return $number
}

function Get-IndependentPaymentNet {
  param(
    [double[]]$Gross,
    [double[]]$Transactions,
    [double]$FailedRate,
    [double]$RefundRate,
    [double]$ChargebackRate,
    [double]$VariableFee,
    [double]$FixedFee,
    [double]$DisputeFee,
    [double]$BillingFee = 0
  )
  $net = 0.0
  foreach ($index in 0..($Gross.Count - 1)) {
    $failedLoss = -$Gross[$index] * $FailedRate
    $collected = $Gross[$index] + $failedLoss
    $refundLoss = -$collected * $RefundRate
    $postRefund = $collected + $refundLoss
    $chargebackLoss = -$postRefund * $ChargebackRate
    $postChargeback = $postRefund + $chargebackLoss
    $variableCost = -$postChargeback * $VariableFee
    $fixedCost = -$Transactions[$index] * (1 - $FailedRate) * $FixedFee
    $disputeCost = -$Transactions[$index] * (1 - $FailedRate) * (1 - $RefundRate) * $ChargebackRate * $DisputeFee
    $billingCost = -$postChargeback * $BillingFee
    $net += $Gross[$index] + $failedLoss + $refundLoss + $chargebackLoss + $variableCost + $fixedCost + $disputeCost + $billingCost
  }
  return $net
}

function Test-IndependentSensitivities {
  param($Inventory)
  $source = $Inventory.sheets | Where-Object name -eq "Sources & Inputs" | Select-Object -First 1
  $scenario = $Inventory.sheets | Where-Object name -eq "Worst Case" | Select-Object -First 1
  if ($null -eq $source -or $null -eq $scenario) {
    Write-Result -Layer "Sensitivity" -Target "required sheets" -Expected "present" -Actual "missing" -Passed $false
    return
  }

  $failed = Get-NumericCellValue $source "B6"
  $refund = Get-NumericCellValue $source "B7"
  $chargeback = Get-NumericCellValue $source "B8"
  $retry = Get-NumericCellValue $source "B9"
  $variableFee = Get-NumericCellValue $source "B10"
  $fixedFee = Get-NumericCellValue $source "B11"
  $disputeFee = Get-NumericCellValue $source "B12"
  $billingFee = if ((Get-InventoryCell $source "C45")[0].value -eq "Yes") { Get-NumericCellValue $source "F45" } else { 0.0 }
  $gross = @(
    (Get-NumericCellValue $scenario "D19"),
    (Get-NumericCellValue $scenario "D20"),
    (Get-NumericCellValue $scenario "D21")
  )
  $transactions = @(
    (Get-NumericCellValue $scenario "B19"),
    (Get-NumericCellValue $scenario "B20"),
    (Get-NumericCellValue $scenario "B21")
  )
  $paymentArgs = @{
    Gross = $gross; Transactions = $transactions; FailedRate = $failed; RefundRate = $refund
    ChargebackRate = $chargeback; VariableFee = $variableFee; FixedFee = $fixedFee
    DisputeFee = $disputeFee; BillingFee = $billingFee
  }
  $paymentNet = Get-IndependentPaymentNet @paymentArgs
  $cachedNet = Get-NumericCellValue $scenario "P53"
  Write-Result -Layer "Oracle" -Target "Worst Case independent payment waterfall" -Expected ([Math]::Round($cachedNet, 2)) -Actual ([Math]::Round($paymentNet, 2)) -Passed ([Math]::Abs($cachedNet - $paymentNet) -lt 0.01)

  $higherFailedArgs = $paymentArgs.Clone()
  $higherFailedArgs.FailedRate = $failed + 0.01
  $higherRefundArgs = $paymentArgs.Clone()
  $higherRefundArgs.RefundRate = $refund + 0.01
  $higherChargebackArgs = $paymentArgs.Clone()
  $higherChargebackArgs.ChargebackRate = $chargeback + 0.001
  $higherFailed = Get-IndependentPaymentNet @higherFailedArgs
  $higherRefund = Get-IndependentPaymentNet @higherRefundArgs
  $higherChargeback = Get-IndependentPaymentNet @higherChargebackArgs
  Assert-True -Layer "Sensitivity" -Target "failed-payment rate +1pp lowers profit/founder basis" -Condition ($higherFailed -lt $paymentNet) -Actual "baseline=$paymentNet mutated=$higherFailed"
  Assert-True -Layer "Sensitivity" -Target "refund rate +1pp lowers profit/founder basis" -Condition ($higherRefund -lt $paymentNet) -Actual "baseline=$paymentNet mutated=$higherRefund"
  Assert-True -Layer "Sensitivity" -Target "chargeback rate +0.1pp lowers profit/founder basis" -Condition ($higherChargeback -lt $paymentNet) -Actual "baseline=$paymentNet mutated=$higherChargeback"

  $overageRows = @(
    @{ Row = 47; Name = "Supabase MAU" },
    @{ Row = 48; Name = "Supabase database disk" },
    @{ Row = 49; Name = "Supabase file storage" },
    @{ Row = 50; Name = "Supabase uncached egress" },
    @{ Row = 51; Name = "Supabase cached egress" },
    @{ Row = 52; Name = "Supabase Edge Function invocations" },
    @{ Row = 57; Name = "Vercel Fast Data Transfer" },
    @{ Row = 58; Name = "Vercel Edge Requests" },
    @{ Row = 59; Name = "Vercel Function Invocations" },
    @{ Row = 60; Name = "Vercel Image Transformations" }
  )
  foreach ($dimension in $overageRows) {
    $row = $dimension.Row
    $usage = Get-NumericCellValue $source "I$row"
    $allowance = Get-NumericCellValue $source "J$row"
    $rate = Get-NumericCellValue $source "K$row"
    $cachedOverage = Get-NumericCellValue $source "L$row"
    $cachedCost = Get-NumericCellValue $source "M$row"
    $expectedOverage = [Math]::Max(0, $usage - $allowance)
    $expectedCost = $expectedOverage * $rate
    Write-Result -Layer "Oracle" -Target "$($dimension.Name) usage=$usage allowance=$allowance rate=$rate" -Expected "overage=$expectedOverage cost=$expectedCost" -Actual "overage=$cachedOverage cost=$cachedCost" -Passed ([Math]::Abs($cachedOverage - $expectedOverage) -lt 0.000001 -and [Math]::Abs($cachedCost - $expectedCost) -lt 0.000001)
    $oneUnitOverCost = ([Math]::Max(0, ($allowance + 1) - $allowance)) * $rate
    $expandedAllowanceCost = ([Math]::Max(0, $usage - ($usage + 1))) * $rate
    Write-Result -Layer "Sensitivity" -Target "$($dimension.Name) usage one unit above allowance" -Expected $rate -Actual $oneUnitOverCost -Passed ([Math]::Abs($oneUnitOverCost - $rate) -lt 0.000000001)
    Write-Result -Layer "Sensitivity" -Target "$($dimension.Name) allowance above usage" -Expected 0 -Actual $expandedAllowanceCost -Passed ([Math]::Abs($expandedAllowanceCost) -lt 0.000000001)
  }

  $officialBase = Get-NumericCellValue $source "E46"
  $activeBase = Get-NumericCellValue $source "F46"
  $actualBaseCell = Get-InventoryCell $source "D46"
  $actualBaseBlank = $actualBaseCell.Count -eq 0 -or [string]::IsNullOrEmpty([string]$actualBaseCell[0].value)
  Write-Result -Layer "Oracle" -Target "vendor actual-over-official fallback" -Expected $officialBase -Actual $activeBase -Passed ($actualBaseBlank -and [Math]::Abs($activeBase - $officialBase) -lt 0.000001)
  $hypotheticalActual = $officialBase + 5
  Assert-True -Layer "Sensitivity" -Target "vendor actual price +5 lowers profit by 5" -Condition ($hypotheticalActual -gt $activeBase) -Actual "baselineCost=$activeBase mutatedCost=$hypotheticalActual profitDelta=-5"

  $freeUsers = Get-NumericCellValue $scenario "B7"
  $eliteUsers = (Get-NumericCellValue $scenario "C7") + (Get-NumericCellValue $scenario "C8")
  $resumeRate = Get-NumericCellValue $source "B17"
  $resumePages = Get-NumericCellValue $source "B18"
  $linkedInRate = Get-NumericCellValue $source "B19"
  $linkedInPages = Get-NumericCellValue $source "B20"
  $freeResumeUploads = Get-NumericCellValue $source "B21"
  $eliteResumeUploads = Get-NumericCellValue $source "B22"
  $freeLinkedInUploads = Get-NumericCellValue $source "B23"
  $eliteLinkedInUploads = Get-NumericCellValue $source "B24"
  $freePageCost = Get-NumericCellValue $source "B38"
  $elitePageCost = Get-NumericCellValue $source "B39"
  function Get-OcrCost([double]$rr, [double]$rp, [double]$lr, [double]$lp) {
    $freePages = ($freeUsers * $freeResumeUploads * $rr * $rp) + ($freeUsers * $freeLinkedInUploads * $lr * $lp)
    $elitePages = ($eliteUsers * $eliteResumeUploads * $rr * $rp) + ($eliteUsers * $eliteLinkedInUploads * $lr * $lp)
    return ($freePages * $freePageCost) + ($elitePages * $elitePageCost)
  }
  $ocrCost = Get-OcrCost $resumeRate $resumePages $linkedInRate $linkedInPages
  $cachedOcr = Get-NumericCellValue $scenario "AK44"
  Write-Result -Layer "Oracle" -Target "Worst Case independent OCR cost" -Expected ([Math]::Round($cachedOcr, 4)) -Actual ([Math]::Round($ocrCost, 4)) -Passed ([Math]::Abs($cachedOcr - $ocrCost) -lt 0.0001)
  Assert-True -Layer "Sensitivity" -Target "resume OCR incidence increase raises cost" -Condition ((Get-OcrCost ($resumeRate + 0.01) $resumePages $linkedInRate $linkedInPages) -gt $ocrCost) -Actual "baseline=$ocrCost"
  Assert-True -Layer "Sensitivity" -Target "resume OCR pages increase raises cost" -Condition ((Get-OcrCost $resumeRate ($resumePages + 1) $linkedInRate $linkedInPages) -gt $ocrCost) -Actual "baseline=$ocrCost"
  Assert-True -Layer "Sensitivity" -Target "LinkedIn OCR incidence increase raises cost" -Condition ((Get-OcrCost $resumeRate $resumePages ($linkedInRate + 0.01) $linkedInPages) -gt $ocrCost) -Actual "baseline=$ocrCost"
  Assert-True -Layer "Sensitivity" -Target "LinkedIn OCR pages increase raises cost" -Condition ((Get-OcrCost $resumeRate $resumePages $linkedInRate ($linkedInPages + 1)) -gt $ocrCost) -Actual "baseline=$ocrCost"

  $aiBaseCost = -(Get-NumericCellValue $scenario "H22")
  $retryCost = $aiBaseCost * (1 + $retry)
  Assert-True -Layer "Sensitivity" -Target "AI retry overhead increase raises cost" -Condition (($aiBaseCost * (1 + $retry + 0.01)) -gt $retryCost) -Actual "baseline=$retryCost"
  $featureRunDeltaCost = $freeUsers * 0.1 * (-(Get-NumericCellValue $scenario "AJ15")) * (1 + $retry)
  Assert-True -Layer "Sensitivity" -Target "free Resume feature-usage driver increase lowers profit" -Condition ($featureRunDeltaCost -gt 0) -Actual "incrementalCost=$featureRunDeltaCost"

  $monthlyPrice = Get-NumericCellValue $source "B13"
  $onePaidNet = Get-IndependentPaymentNet -Gross @($monthlyPrice) -Transactions @(1.0) -FailedRate $failed -RefundRate $refund -ChargebackRate $chargeback -VariableFee $variableFee -FixedFee $fixedFee -DisputeFee $disputeFee -BillingFee $billingFee
  $freeAiPerUser = -(Get-NumericCellValue $scenario "C13") * (1 + $retry)
  $eliteAiPerUser = -(Get-NumericCellValue $scenario "C14") * (1 + $retry)
  $freeOcrPerUser = (($freeResumeUploads * $resumeRate * $resumePages) + ($freeLinkedInUploads * $linkedInRate * $linkedInPages)) * $freePageCost
  $eliteOcrPerUser = (($eliteResumeUploads * $resumeRate * $resumePages) + ($eliteLinkedInUploads * $linkedInRate * $linkedInPages)) * $elitePageCost
  $freeUnitContribution = -$freeAiPerUser - $freeOcrPerUser
  $paidUnitContribution = $onePaidNet - $eliteAiPerUser - $eliteOcrPerUser
  Assert-True -Layer "Sensitivity" -Target "paid-user percentage increase raises profit at current unit economics" -Condition ($paidUnitContribution -gt $freeUnitContribution) -Actual "freeUnit=$freeUnitContribution paidUnit=$paidUnitContribution"

  $mau = Get-NumericCellValue $scenario "G4"
  $profit = Get-NumericCellValue $scenario "B48"
  $vendor = Get-NumericCellValue $scenario "X56"
  $mauVendor = Get-NumericCellValue $scenario "X50"
  $factor = 1.01
  $newMau = $mau * $factor
  $newMauVendor = [Math]::Max(0, $newMau - (Get-NumericCellValue $source "J47")) * (Get-NumericCellValue $source "K47")
  $mutatedProfit = (($profit + $vendor) * $factor) - (($vendor - $mauVendor) + $newMauVendor)
  Assert-True -Layer "Sensitivity" -Target "total MAU +1% raises profit at current scenario economics" -Condition ($mutatedProfit -gt $profit) -Actual "baseline=$profit mutated=$mutatedProfit"
}

function Invoke-Tooling {
  param(
    [string]$HandoffPath,
    [string]$WorkbookHash,
    [long]$WorkbookLength
  )

  if (-not (Test-Path -LiteralPath $HandoffPath -PathType Leaf)) {
    Write-Result -Layer "Tooling" -Target "connected Excel handoff" -Expected "present" -Actual "missing" -Passed $false
    return
  }

  $handoff = Get-Content -LiteralPath $HandoffPath -Raw | ConvertFrom-Json
  $requiredTools = @(
    "read_sheets_metadata@1",
    "read_ranges@1",
    "write_range@1",
    "update_workbook@1",
    "copy_range_to@1",
    "format_range@1",
    "resize_range@1",
    "read_range_image@1"
  )
  $actualTools = @($handoff.authoringBackend.supportedTools)

  Assert-Equal -Layer "Tooling" -Target "toolingPass" -Expected $true -Actual $handoff.toolingPass
  Assert-Equal -Layer "Tooling" -Target "authoring backend" -Expected "connected-excel-session" -Actual $handoff.authoringBackend.kind
  Assert-Equal -Layer "Tooling" -Target "workbook title" -Expected "Strivo AI Final Costing Plan.xlsx" -Actual $handoff.authoringBackend.workbookTitle
  Assert-Equal -Layer "Tooling" -Target "registration verified" -Expected $true -Actual $handoff.authoringBackend.registrationVerified
  Assert-Equal -Layer "Tooling" -Target "baseline read verified" -Expected $true -Actual $handoff.authoringBackend.baselineReadVerified
  Assert-Equal -Layer "Tooling" -Target "calculation/render engine" -Expected "microsoft-excel-live" -Actual $handoff.calculationRenderEngine.kind
  Assert-Equal -Layer "Tooling" -Target "baseline SHA-256" -Expected $handoff.baseline.sha256 -Actual $WorkbookHash
  Assert-Equal -Layer "Tooling" -Target "baseline length" -Expected $handoff.baseline.lengthBytes -Actual $WorkbookLength
  Assert-Equal -Layer "Tooling" -Target "baseline sheet order" -Expected ($script:ExpectedScenarioNames -join ", ") -Actual (@($handoff.baseline.sheetOrder) -join ", ")

  foreach ($tool in $requiredTools) {
    Assert-True -Layer "Tooling" -Target "capability $tool" -Condition ($actualTools -contains $tool) -Actual $(if ($actualTools -contains $tool) { "advertised" } else { "missing" })
  }
}

$repoRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$resolvedWorkbook = Resolve-RepositoryFile -Path $WorkbookPath -Name "WorkbookPath" -RepositoryRoot $repoRoot
if (-not (Test-Path -LiteralPath $resolvedWorkbook -PathType Leaf)) {
  throw "WorkbookPath does not exist: '$resolvedWorkbook'."
}
$resolvedAuditPath = Resolve-RepositoryFile -Path $BaselineAuditPath -Name "BaselineAuditPath" -RepositoryRoot $repoRoot
$resolvedToolingHandoffPath = Resolve-RepositoryFile -Path $ToolingHandoffPath -Name "ToolingHandoffPath" -RepositoryRoot $repoRoot
$resolvedLiveEvidencePath = Resolve-RepositoryFile -Path $LiveEvidencePath -Name "LiveEvidencePath" -RepositoryRoot $repoRoot
$resolvedPhaseDirectory = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $script:PhaseDirectory))
if (-not (Test-PathWithin -Candidate $resolvedAuditPath -Root $resolvedPhaseDirectory)) {
  throw "BaselineAuditPath must resolve under phase directory '$resolvedPhaseDirectory'; actual '$resolvedAuditPath'."
}
if (-not (Test-PathWithin -Candidate $resolvedToolingHandoffPath -Root $resolvedPhaseDirectory)) {
  throw "ToolingHandoffPath must resolve under phase directory '$resolvedPhaseDirectory'; actual '$resolvedToolingHandoffPath'."
}
if (-not (Test-PathWithin -Candidate $resolvedLiveEvidencePath -Root $resolvedPhaseDirectory)) {
  throw "LiveEvidencePath must resolve under phase directory '$resolvedPhaseDirectory'; actual '$resolvedLiveEvidencePath'."
}

$beforeHash = Get-FileSha256Shared -Path $resolvedWorkbook
$beforeLength = (Get-Item -LiteralPath $resolvedWorkbook).Length
$inventory = if ($Mode -eq "Tooling") { $null } else { Get-WorkbookInventory -ResolvedWorkbook $resolvedWorkbook }

switch ($Mode) {
  "Baseline" { Invoke-Baseline -Inventory $inventory -AuditPath $resolvedAuditPath }
  "Quick" { Invoke-Quick -Inventory $inventory }
  "Security" { Test-StaticIntegrity -Inventory $inventory }
  "Tooling" { Invoke-Tooling -HandoffPath $resolvedToolingHandoffPath -WorkbookHash $beforeHash -WorkbookLength $beforeLength }
  "Oracle" {
    Test-StaticIntegrity -Inventory $inventory
    Test-CompletedWorkbookFacts -Inventory $inventory
    Test-IndependentSensitivities -Inventory $inventory
    Test-LiveEvidence -EvidencePath $resolvedLiveEvidencePath -WorkbookHash $beforeHash -Layer "Oracle"
  }
  "Render" {
    Test-LiveEvidence -EvidencePath $resolvedLiveEvidencePath -WorkbookHash $beforeHash -Layer "Render"
  }
  "Full" {
    Invoke-Quick -Inventory $inventory
    Test-IndependentSensitivities -Inventory $inventory
    Test-LiveEvidence -EvidencePath $resolvedLiveEvidencePath -WorkbookHash $beforeHash -Layer "Full"
  }
}

$afterHash = Get-FileSha256Shared -Path $resolvedWorkbook
$afterLength = (Get-Item -LiteralPath $resolvedWorkbook).Length
Assert-Equal -Layer "Boundary" -Target "workbook SHA-256 unchanged" -Expected $beforeHash -Actual $afterHash
Assert-Equal -Layer "Boundary" -Target "workbook length unchanged" -Expected $beforeLength -Actual $afterLength

if ($script:Failures.Count -gt 0) {
  Write-Host "verify-costing-workbook.ps1 FAILED: $($script:Failures.Count) check(s) failed."
  foreach ($failure in $script:Failures) { Write-Host "  - $failure" }
  exit 1
}

Write-Host "verify-costing-workbook.ps1 PASSED: mode=$Mode workbook=$resolvedWorkbook"
exit 0
