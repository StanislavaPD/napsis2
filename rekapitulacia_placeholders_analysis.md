# Placeholder Analysis: Рекапитулация Приложение 3.docx

## Executive Summary

**Document:** `d:\New folder\napsis\public\templates\Напояване шаблони\Рекапитулация Приложение 3.docx`

**Total Unique Placeholders:** 23
**Total Placeholder Instances:** 103
**Document Structure:** 10 tables

---

## Complete Placeholder List

### 1. Header/Document Information Placeholders (7 placeholders, 12 instances)

| Placeholder | Count | Location | Purpose |
|------------|-------|----------|---------|
| `{ДАТА}` | 1 | Header section | Document date |
| `{ ВОДОПОЛЗВАТЕЛ }` | 2 | Header section | Water user name (appears twice) |
| `{Договор №}` | 2 | Header section | Contract number (appears twice) |
| `{ЗЕМЛИЩЕ}` | 11 | Area listing table + detail tables | Land area/region name |
| `{№ на масив }` | 3 | Area listing table | Massif/block number |
| `{дка}` | 11 | Area listing table + detail tables | Area in decares (дка) |
| `{БРОЙ ПОЛИВКИОБЩО}` | 1 | Summary table | Total irrigation count |

### 2. Repeating Detail Table Placeholders (8 tables × 10 placeholders each = 80 instances)

These placeholders appear in 8 identical irrigation detail tables:

| Placeholder | Count per Table | Total Count | Purpose |
|------------|----------------|-------------|---------|
| `{ЗЕМЛИЩЕ}` | 1 | 8 | Land area name |
| `{дка}` | 1 | 8 | Area in decares |
| `{КУЛТУРА}` | 1 | 8 | Crop/culture type |
| `{ПОЛ НОРМА}` | 1 | 8 | Irrigation norm |
| `{ЗАЯВЕН ОБЕМ ГР.}` | 1 | 8 | Declared volume gravity |
| `{ЗАЯВЕН ОБЕМ ПОМПЕНО}` | 1 | 8 | Declared volume pumped |
| `{БР. ПОЛИВКИ}` | 1 | 8 | Number of irrigations |
| `{АКТУВАН ОБЕМ ГР.}` | 1 | 8 | Actual volume gravity |
| `{АКТУВАН ОБЕМ ПОМПЕНО}` | 1 | 8 | Actual volume pumped |
| `{РАЗЛИКА}` | 1 | 8 | Difference |

**Note:** These 10 placeholders repeat across 8 separate tables (likely representing different irrigation zones or periods).

### 3. Summary/Financial Table Placeholders (9 placeholders, 11 instances)

| Placeholder | Count | Purpose |
|------------|-------|---------|
| `{ЗАЯВЕН ОБЕМ ОБЩО ГР.}` | 1 | Total declared volume gravity |
| `{ЗАЯВЕН ОБЕМ ОБЩО ПОМПЕНО}` | 1 | Total declared volume pumped |
| `{ Доставен обем вода гравитачно }` | 1 | Delivered water volume gravity |
| `{ Доставен обем вода помпено }` | 1 | Delivered water volume pumped |
| `{ Разлика }` | 1 | Difference |
| `{ Цена по Заповед }` | 1 | Price per order |
| `{ Заплатена сума }` | 1 | Paid amount |
| `{ Разлика за доплащане/за възстановяване }` | 1 | Difference to pay/refund |
| `{БРОЙ ПОЛИВКИОБЩО}` | 1 | Total irrigation count (shared with section 1) |

---

## Document Structure Breakdown

### Table 1: Area Listing (Initial Declaration)
- **Rows:** 4
- **Placeholders:** `{ЗЕМЛИЩЕ}`, `{№ на масив }`, `{дка}` (each appears 3 times for 3 areas)
- **Purpose:** Lists the declared areas to be irrigated

### Tables 2-9: Detailed Irrigation Records (8 identical tables)
- **Rows per table:** 3
- **Placeholders per table:** 10 unique placeholders
- **Purpose:** Records irrigation details for each zone/period
- **Structure:** Each table contains:
  - Area identification: `{ЗЕМЛИЩЕ}`, `{дка}`
  - Crop data: `{КУЛТУРА}`, `{ПОЛ НОРМА}`
  - Declared volumes: `{ЗАЯВЕН ОБЕМ ГР.}`, `{ЗАЯВЕН ОБЕМ ПОМПЕНО}`
  - Irrigation count: `{БР. ПОЛИВКИ}`
  - Actual volumes: `{АКТУВАН ОБЕМ ГР.}`, `{АКТУВАН ОБЕМ ПОМПЕНО}`
  - Calculation: `{РАЗЛИКА}`

### Table 10: Summary/Financial Table
- **Rows:** 3
- **Placeholders:** 9 (mostly summary calculations and financial data)
- **Purpose:** Totals and financial reconciliation

---

## Placeholder Categories by Data Type

### Identity/Reference Placeholders
- `{ДАТА}` - Date
- `{ ВОДОПОЛЗВАТЕЛ }` - Water user name
- `{Договор №}` - Contract number
- `{ЗЕМЛИЩЕ}` - Land area name
- `{№ на масив }` - Massif number

### Area/Measurement Placeholders
- `{дка}` - Area in decares

### Agricultural Placeholders
- `{КУЛТУРА}` - Crop type
- `{ПОЛ НОРМА}` - Irrigation norm

### Volume Placeholders (Declared)
- `{ЗАЯВЕН ОБЕМ ГР.}` - Declared volume gravity (per detail)
- `{ЗАЯВЕН ОБЕМ ПОМПЕНО}` - Declared volume pumped (per detail)
- `{ЗАЯВЕН ОБЕМ ОБЩО ГР.}` - Total declared volume gravity
- `{ЗАЯВЕН ОБЕМ ОБЩО ПОМПЕНО}` - Total declared volume pumped

### Volume Placeholders (Actual)
- `{АКТУВАН ОБЕМ ГР.}` - Actual volume gravity
- `{АКТУВАН ОБЕМ ПОМПЕНО}` - Actual volume pumped
- `{ Доставен обем вода гравитачно }` - Delivered water volume gravity
- `{ Доставен обем вода помпено }` - Delivered water volume pumped

### Count Placeholders
- `{БР. ПОЛИВКИ}` - Number of irrigations (per detail)
- `{БРОЙ ПОЛИВКИОБЩО}` - Total number of irrigations

### Calculation/Difference Placeholders
- `{РАЗЛИКА}` - Difference (per detail table)
- `{ Разлика }` - Difference (summary)

### Financial Placeholders
- `{ Цена по Заповед }` - Price per order
- `{ Заплатена сума }` - Paid amount
- `{ Разлика за доплащане/за възстановяване }` - Difference to pay/refund

---

## Naming Conventions Observed

The document uses TWO different placeholder styles:

1. **ALL CAPS with curly braces (no spaces):** `{PLACEHOLDER}`
   - Used for: detail table data (irrigation records)
   - Examples: `{ЗЕМЛИЩЕ}`, `{КУЛТУРА}`, `{РАЗЛИКА}`

2. **Sentence case with spaces inside braces:** `{ Placeholder Text }`
   - Used for: summary/financial data
   - Examples: `{ Доставен обем вода гравитачно }`, `{ Заплатена сума }`

**Exception:** `{ ВОДОПОЛЗВАТЕЛ }` uses ALL CAPS but has spaces (used in header)

---

## Data Flow Analysis

The document follows this data flow:

1. **Header:** Identifies the document, date, water user, and contract
2. **Area Declaration (Table 1):** Lists 3 areas with their massif numbers and sizes
3. **Detail Records (Tables 2-9):** 8 sets of irrigation records showing:
   - What was declared (заявен обем)
   - What was actually delivered (актуван обем)
   - The difference between them
4. **Summary (Table 10):** Aggregates all data and calculates financial reconciliation

---

## Notes for Implementation

### Repeating Table Logic
- Tables 2-9 are identical in structure but contain different data
- These 8 tables likely need to be generated dynamically based on the number of irrigation zones or periods
- Consider using a loop/iteration approach when populating these tables

### Calculation Fields
The following placeholders appear to be calculated values:
- `{РАЗЛИКА}` = `{ЗАЯВЕН ОБЕМ}` - `{АКТУВАН ОБЕМ}` (appears in each detail table)
- `{ Разлика }` = summary level difference
- `{ Разлика за доплащане/за възстановяване }` = financial reconciliation

### Consistency Check
- Verify that the sum of all `{АКТУВАН ОБЕМ ГР.}` from tables 2-9 equals `{ Доставен обем вода гравитачно }`
- Verify that the sum of all `{АКТУВАН ОБЕМ ПОМПЕНО}` from tables 2-9 equals `{ Доставен обем вода помпено }`
- Verify that the sum of all `{БР. ПОЛИВКИ}` equals `{БРОЙ ПОЛИВКИОБЩО}`

---

## Comparison Notes

To compare with the previous version, the following information would be helpful:
- Was there a previous version of this template?
- What were the old placeholders?
- Are there any NEW placeholders that weren't in the old version?
- Are there any REMOVED placeholders?

If you have the old template file, I can perform a detailed comparison to identify:
1. Added placeholders
2. Removed placeholders
3. Renamed placeholders
4. Changed placeholder locations

---

## Generated: 2026-09-24
