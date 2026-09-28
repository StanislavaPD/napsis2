# ЗАЯВКА ПРИЛОЖЕНИЕ 4 - Complete Document Structure

## File Location
`d:\New folder\napsis\public\templates\Напояване шаблони\Заявка Приложение 4.docx`

---

## Placeholders (16 total)

1. `{ ВОДОПОЛЗВАТЕЛ }` - Water user/client name
2. `{OT}` - Start date/time (appears in paragraph text)
3. `{ДКА}` - Area in decares (in table)
4. `{ДО}` - End date/time
5. `{Договор №}` - Contract number
6. `{КУЛТУРА}` - Crop/culture name (row 1)
7. `{КУЛТУРА2}` - Crop/culture name (row 2)
8. `{КУЛТУРА 3}` - Crop/culture name (row 3)
9. `{НАП. СИСТЕМА}` - Irrigation system
10. `{ОТ}` - Start date (in table)
11. `{ПИ}` - Property identifier (ПИ номер)
12. `{ПОЛ НОРМА}` - Irrigation norm (m3)
13. `{ПОЛИВКА НОМ}` - Irrigation number (secondary)
14. `{ПОЛИВКА НОМЕР}` - Irrigation number (main - in title)
15. `{СЪОРАЖЕНИЕ}` - Facility/structure
16. `{ХТУ}` - ХТУ (hydro-technical unit)

---

## Document Structure

### HEADER SECTION

**[P0] RIGHT aligned, BOLD:**
```
Приложение № 4 по чл.12 от Общите условия
```

**[P1-P2]:** Empty lines

**[P3] CENTER aligned, BOLD:**
```
ЗАЯВКА   ЗА ПОЛИВКА №  {ПОЛИВКА НОМЕР}
```

**[P4]:** Empty line

**[P5] JUSTIFY aligned, BOLD:**
```
Към Договор за доставка на вода за напояване №  {Договор №}
```

**[P6]:** Empty line

---

### SUPPLIER & CLIENT INFO

**[P7] JUSTIFY aligned:**
```
ДОСТАВЧИК: клон " Средна Тунджа", ХТР/ХТУ: ЯМБОЛ/{ХТУ}
```

**[P8] JUSTIFY aligned:**
```
ВОДОПОЛЗВАТЕЛ: { ВОДОПОЛЗВАТЕЛ }
```

**[P9]:** Empty line

---

### INTRODUCTION TEXT

**[P10] JUSTIFY aligned:**
```
Доставчикът се задължава да достави вода за напояване за имоти и по култури,
заявени от Водоползвателя, както следва:
```

**[P11]:** Empty line

---

### PROPERTY & SYSTEM INFO

**[P12] LEFT/DEFAULT aligned, BOLD:**
```
ПИ№ {ПИ} 							НС  {НАП. СИСТЕМА}
```
*Note: Contains multiple tabs between ПИ and НС*

**[P13] JUSTIFY aligned, BOLD:**
```
съоръжение/{СЪОРАЖЕНИЕ}, поливка № {ПОЛИВКА НОМ}
```

**[P14] JUSTIFY aligned, BOLD:**
```
за времето от{OT} до {ДО} 2026 г. желая да ми бъде доставена вода, както следва:
```

**[P15-P16]:** Empty lines

---

### TABLE - Irrigation Schedule

**Table:** 12 rows × 13 columns

#### Header Row 0 (Multi-level header):
| Col | Alignment | Content |
|-----|-----------|---------|
| 0 | JUSTIFY | КУЛТУРИ |
| 1 | JUSTIFY | Площ |
| 2 | JUSTIFY | Поливна норма |
| 3 | CENTER | поливка |
| 4 | CENTER | времетраене  на  поливането |
| 5 | CENTER | времетраене  на  поливането |
| 6 | CENTER | времетраене  на  поливането |
| 7 | CENTER | времетраене  на  поливането |
| 8 | CENTER | Начин на водопод. |
| 9 | CENTER | Начин на водопод. |
| 10 | CENTER | Начин на отчитане на в. маси |
| 11 | JUSTIFY | Цена по Заповед |
| 12 | JUSTIFY | Дължима сума, с ДДС |

#### Header Row 1:
| Col | Alignment | Content |
|-----|-----------|---------|
| 0 | JUSTIFY | КУЛТУРИ |
| 1 | JUSTIFY | Площ |
| 2 | JUSTIFY | Поливна норма |
| 3 | CENTER | поливка |
| 4 | JUSTIFY | Начало |
| 5 | JUSTIFY | Начало |
| 6 | JUSTIFY | Край |
| 7 | JUSTIFY | Край |
| 8 | CENTER | Гравитачно |
| 9 | CENTER | Помпено |
| 10 | CENTER | Начин на отчитане на в. маси |
| 11 | JUSTIFY | Цена по Заповед |
| 12 | JUSTIFY | Дължима сума, с ДДС |

#### Header Row 2:
| Col | Alignment | Content |
|-----|-----------|---------|
| 0 | JUSTIFY | КУЛТУРИ |
| 1 | JUSTIFY | дка |
| 2 | JUSTIFY | м3 |
| 3 | JUSTIFY | № |
| 4 | JUSTIFY | дата |
| 5 | JUSTIFY | час |
| 6 | JUSTIFY | дата |
| 7 | JUSTIFY | час |
| 8 | CENTER | Гравитачно |
| 9 | CENTER | Помпено |
| 10 | CENTER | Начин на отчитане на в. маси |
| 11 | JUSTIFY | € |
| 12 | JUSTIFY | € |

#### Header Row 3 (Column Numbers):
| 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 |
|---|---|---|---|---|---|---|---|---|----|----|----|----|
(All CENTER aligned)

#### Data Row 4:
| Col | Content |
|-----|---------|
| 0 | {КУЛТУРА} |
| 1 | {ДКА} |
| 2 | {ПОЛ НОРМА} |
| 3 | (empty) |
| 4 | {ОТ} |
| 5 | (empty) |
| 6 | {ДО} |
| 7-12 | (empty) |

#### Data Row 5:
| Col | Content |
|-----|---------|
| 0 | {КУЛТУРА2} |
| 1 | {ДКА} |
| 2 | {ПОЛ НОРМА} |
| 3 | (empty) |
| 4 | {ОТ} |
| 5 | {ДО} |
| 6-12 | (empty) |

#### Data Row 6:
| Col | Content |
|-----|---------|
| 0 | {КУЛТУРА 3} |
| 1 | {ДКА} |
| 2 | {ПОЛ НОРМА} |
| 3 | (empty) |
| 4 | {ОТ} |
| 5 | (empty) |
| 6 | {ДО} |
| 7-12 | (empty) |

#### Rows 7-11:
All empty (reserved for additional crops)

---

### FOOTER SECTION

**[P17] JUSTIFY aligned:**
```
На основание чл. 13 от Общите условия към Договори за доставка на вода за напояване:
```

**[P18] JUSTIFY aligned:**
```
- Доставчикът отчита доставената вода на Водоползвателя, чрез Акт дневник за напояване.
```

**[P19] JUSTIFY aligned:**
```
- Водоползвателят, заявява, че е запознат с Общите условия към Договори за доставка на вода за
напояване и ги приема безусловно.
```

**[P20-P21]:** Empty lines

**[P22] JUSTIFY aligned:**
```
 Доставчик: ……………………                               Водоползвател: ………………………...
```

---

## Formatting Summary

### Text Formatting
- **Bold text**: Header (P0), Title (P3), Subtitle (P5), Property info (P12-P14)
- **Regular text**: All other content

### Alignment
- **RIGHT**: Header only (P0)
- **CENTER**: Title (P3) and table column numbers
- **JUSTIFY**: Most body text and table headers
- **LEFT/DEFAULT**: Property identifier line (P12)

### Spacing
- Multiple empty lines used for visual separation
- No specific spacing measurements detected (using default paragraph spacing)

### Table Structure
- 3 header rows with merged/split cells for complex column headers
- 1 numbering row
- 3 data rows with placeholders
- 5 empty rows for manual entry

---

## Notes for Implementation

1. **Date placeholders**: {OT} and {ДО} appear both in paragraph text (P14) and table rows
2. **Культура repetition**: Three crop rows supported ({КУЛТУРА}, {КУЛТУРА2}, {КУЛТУРА 3})
3. **Tabs in P12**: The line with ПИ and НС uses multiple tabs for spacing
4. **Signature line**: Uses dots (……) for signature placeholders
5. **Year hardcoded**: "2026 г." is hardcoded in paragraph 14
6. **Table columns**: Only columns 0, 1, 2, 4, 6 are populated with placeholders in data rows

---

## Preview Visualization Requirements

When creating a preview, ensure:

1. ✅ Right-aligned header with bold text
2. ✅ Centered title with irrigation number placeholder
3. ✅ Two-level heading hierarchy (Заявка title, then Към Договор subtitle)
4. ✅ Justified body text
5. ✅ Complex table with 3-row merged header
6. ✅ Support for 3 crops minimum (extendable to more)
7. ✅ Proper spacing with empty lines between sections
8. ✅ Signature line at bottom with dots
9. ✅ All 16 placeholders properly positioned
10. ✅ Bold formatting on specific sections

---

## End of Document
