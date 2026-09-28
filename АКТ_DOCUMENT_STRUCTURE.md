# АКТ Document Structure Analysis
## File: d:\New folder\napsis\public\templates\Напояване шаблони\акт.docx

---

## COMPLETE DOCUMENT STRUCTURE

### Header Section (Paragraphs 1-12)

**Paragraph 1:**
```
ДОСТАВЧИК:ВОДОПОЛЗВАТЕЛ:
```

**Paragraph 2:**
```
"НА ПОИТЕ ЛНИ СИСТЕМИ"   ФИРМА:{Kontragent}
```

**Paragraph 3:**
```
ЕАД КЛОН СРЕДНА ТУНДЖА{bulstat}
```

**Paragraph 4:**
```
                                         AКТ   №   {nomernaakt}   по Договор  № {dogowor nomer}/{data}  год..............................................................................................................
```

**Paragraph 5:**
```
 Зa вoдни маси за напояване на селскостопански култури и дpyги нужди с държавни водиФизическо лице:{fizicheskoliceKontragent}
```

**Paragraph 6:**
```
Днес, {datanaakta} {Godina} г., ce състави настояшият акт в уверение на това че Доставчикът е подал…….....................................................................................................
```

**Paragraph 7:**
```
на Водоползвателя и последният  приел през времето от {dataot} до {datado} куб. м. вода за напояване,…….....................................................................................................
```

**Paragraph 8:**
```
от която гравитачно {obemgravitachno},куб. м., помпено {obempompeno}куб. м.; за други нужди  {obemdrnujdi} куб. м., от която                 Л.К № .......................................................................... издадена от
```

**Paragraph 9:**
```
гравитачно {grawitachno} куб. и., помпено {pompeno} куб. м............................................ЕИК/ЕГН {Bulstat}
```

**Paragraph 10:**
```
Доставената вода е подадена на Водоползвателя я, както следва {kanal,ps,wodoprowod} живущ в гр./с./ {adres }.
```

**Paragraph 11:**
```
………………………………………………….….…/канал, ПC, водопровод и др./……………………………………………………
```

**Paragraph 12:**
```
…………………………………………………………………………………………………и са поляти следните култури
```

---

## TABLE STRUCTURE (20 rows, 13 columns)

### Table Header Structure (4 header rows with complex merging)

#### Row 1 - Top Level Groups:
- **Column 1:** [Empty, vertically merged down]
- **Columns 2-7 (span 6):** `ПОЛИВКА  № {nomerpolivka}`
- **Columns 8-10 (span 3):** `ПОЛИВОДЕКАРИ`
- **Columns 11-13 (span 3, vertically merged down):** `ВСИЧКО ВОДНИ МАСИ`

#### Row 2 - Second Level Groups:
- **Column 1:** [Merged from row 1]
- **Column 2 (vertically merged down):** `ПОЛЯТИдкаОБЩО(дка)`
- **Columns 3-4 (span 2):** `в това число`
- **Columns 5-7 (span 3):** `Актувана вода`
- **Column 8 (vertically merged down):** `ПОЛЯТИдка ОБЩО (дка)`
- **Columns 9-10 (span 2):** `в това число`
- **Column 11-13:** [Merged from row 1]

#### Row 3 - Third Level:
- **Column 1:** [Merged from above]
- **Column 2:** [Merged from above]
- **Column 3 (vertically merged down):** `гравитачно (м3)`
- **Column 4 (vertically merged down):** `помпено (дка)`
- **Column 5 (vertically merged down):** `ОБЩО(куб. м.)`
- **Column 6-7:** [Part of "Актувана вода"]
- **Column 8 (vertically merged down):** `гравитачно (м3)`
- **Column 9 (vertically merged down):** `помпено(дка)`
- **Column 10 (vertically merged down):** `ОБЩО(куб. м.)`
- **Columns 11-12 (span 2):** `в това число`

#### Row 4 - Final Column Headers:
- **Column 1:** [Merged from above - Culture name]
- **Column 2:** [Merged from above - ПОЛЯТИ дка ОБЩО]
- **Column 3:** [Merged from above - гравитачно (м3)]
- **Column 4:** [Merged from above - помпено (дка)]
- **Column 5:** [Merged from above - ОБЩО (куб. м.)]
- **Column 6:** `гравитачно (куб. м.)`
- **Column 7:** `помпено (куб. м.)`
- **Column 8:** [Merged from above - ПОЛЯТИ дка ОБЩО]
- **Column 9:** [Merged from above - гравитачно (м3)]
- **Column 10:** [Merged from above - помпено (дка)]
- **Column 11:** [Merged from above - ОБЩО (куб. м.)]
- **Column 12:** `гравитачно (куб. м.)`
- **Column 13:** `помпено (куб. м.)`

### Final Column Meanings (13 columns):

1. **Culture Name** - Name of the agricultural culture
2. **ПОЛЯТИ дка ОБЩО (дка)** - Total irrigated area in decares
3. **в това число - гравитачно (м3)** - Of which: gravity irrigation area
4. **в това число - помпено (дка)** - Of which: pumped irrigation area
5. **Актувана вода - ОБЩО (куб. м.)** - Documented water - Total volume
6. **Актувана вода - гравитачно (куб. м.)** - Documented water - Gravity volume
7. **Актувана вода - помпено (куб. м.)** - Documented water - Pumped volume
8. **ПОЛЯТИ дка ОБЩО (дка)** - [Repeat] Total irrigated area
9. **ПОЛЯТИ - гравитачно (м3)** - Irrigated - Gravity volume
10. **ПОЛЯТИ - помпено (дка)** - Irrigated - Pumped area
11. **ВСИЧКО ВОДНИ МАСИ - ОБЩО (куб. м.)** - Total water masses - Total volume
12. **ВСИЧКО ВОДНИ МАСИ - гравитачно (куб. м.)** - Total water masses - Gravity volume
13. **ВСИЧКО ВОДНИ МАСИ - помпено (куб. м.)** - Total water masses - Pumped volume

### Data Rows (Rows 5-8 for cultures, Rows 9-19 empty, Row 20 totals)

#### Row 5 (Culture 1):
```
{kultura1} | {dka} | {dkagravitachno} | {dkapompeno} | {obshtoobem} | {obemgr) | {obempopmeno} | {poliwodka} | {poliwodkagr} | {poliwodkapompeno} | {obshobem} | {obshtobemgr} | {obshtobempompeno}
```

#### Row 6 (Culture 2):
```
{kultura2} | {dka} | {dkagravitachno} | {dkapompeno} | {obshtoobem} | {obemgr) | {obempopmeno} | {poliwodka} | {poliwodkagr} | {poliwodkapompeno} | {obshobem} | {obshtobemgr} | {obshtobempompeno}
```

#### Row 7 (Culture 3):
```
{kultura3} | {dka} | {dkagravitachno} | {dkapompeno} | {obshtoobem} | {obemgr) | {obempopmeno} | {poliwodka} | {poliwodkagr} | {poliwodkapompeno} | {obshobem} | {obshtobemgr} | {obshtobempompeno}
```

#### Row 8 (Culture 4):
```
{kultura4} | {dka} | {dkagravitachno} | {dkapompeno} | {obshtoobem} | {obemgr) | {obempopmeno} | {poliwodka} | {poliwodkagr} | {poliwodkapompeno} | {obshobem} | {obshtobemgr} | {obshtobempompeno}
```

#### Rows 9-19:
Empty rows (15 total)

#### Row 20 (Totals):
```
ВСИЧКО: | {sum} | {sum} | {sum} | {sum} | {sum} | {sum} | {sum} | {sum} | {sum} | {sum} | {sum} | {sum}
```

---

## Footer Section (Paragraphs 14-15)

**Paragraph 14:**
```
ДОСТАВЧИК : Техн. Напояване ХТР ……………………………………………..ВОДОПОЛЗВА ТЕЛ: ……………………………………………………………
```

**Paragraph 15:**
```
       /    инж. Н. Касидов                 /       /       {molkontragent}                       /
```

---

## COMPLETE PLACEHOLDER LIST (36 Total)

### Header/Document Information (13 placeholders):
1. `{Kontragent}` - Client company name
2. `{bulstat}` - Client BULSTAT number (first occurrence)
3. `{Bulstat}` - EIK/EGN number (second occurrence)
4. `{nomernaakt}` - Act number
5. `{dogowor nomer}` - Contract number
6. `{data}` - Contract date/year
7. `{fizicheskoliceKontragent}` - Physical person name (if applicable)
8. `{datanaakta}` - Act date
9. `{Godina}` - Year
10. `{dataot}` - Period start date
11. `{datado}` - Period end date
12. `{nomerpolivka}` - Irrigation number
13. `{molkontragent}` - Client representative signature line

### Body/Volume Information (14 placeholders):
14. `{obemgravitachno}` - Total gravity irrigation volume
15. `{obempompeno}` - Total pumped irrigation volume
16. `{obemdrnujdi}` - Other needs water volume
17. `{grawitachno}` - Gravity volume for other needs
18. `{pompeno}` - Pumped volume for other needs
19. `{kanal,ps,wodoprowod}` - Water delivery method (canal, PS, water supply)
20. `{adres }` - Address (note: has space before closing brace)
21. `{dka}` - Decares (appears in table rows)
22. `{dkagravitachno}` - Decares gravity
23. `{dkapompeno}` - Decares pumped
24. `{obemgr)` - Volume gravity (note: has closing parenthesis instead of brace!)
25. `{obempopmeno}` - Volume pumped
26. `{obshtoobem}` - Total volume
27. `{poliwodka}` - Irrigation water

### Table/Culture Data (9 unique placeholders, used repeatedly):
28. `{kultura1}` - Culture 1 name
29. `{kultura2}` - Culture 2 name
30. `{kultura3}` - Culture 3 name
31. `{kultura4}` - Culture 4 name
32. `{poliwodkagr}` - Irrigation water gravity
33. `{poliwodkapompeno}` - Irrigation water pumped
34. `{obshobem}` - Total volume (general)
35. `{obshtobemgr}` - Total volume gravity
36. `{obshtobempompeno}` - Total volume pumped
37. `{sum}` - Sum/total (appears 12 times in the total row)

---

## IMPORTANT NOTES

### Placeholder Issues Found:
1. **`{obemgr)`** - Has closing parenthesis `)` instead of closing brace `}` - This is likely a typo in the template!
2. **`{adres }`** - Has a space before the closing brace
3. **`{dogowor nomer}`** - Has a space in the placeholder name
4. **`{kanal,ps,wodoprowod}`** - Has commas in the placeholder name

### Table Structure Notes:
- The table has complex merged cells in the header (4 header rows)
- Main sections: ПОЛИВКА (Irrigation), ПОЛИВОДЕКАРИ, ВСИЧКО ВОДНИ МАСИ (Total Water Masses)
- 13 actual data columns
- 4 culture rows (can repeat the same placeholders for different cultures)
- 15 empty rows for additional cultures if needed
- 1 total row with {sum} placeholders

### Document Flow:
1. **Header:** Supplier and client information
2. **Act details:** Act number, contract reference, dates
3. **Physical person info:** If applicable
4. **Volume summary:** Total volumes delivered (gravity + pumped)
5. **Delivery details:** How and where water was delivered
6. **Culture table:** Detailed breakdown by culture type
7. **Footer:** Signatures for both parties

---

## Document Purpose

This is an ACT document for recording water delivery for irrigation of agricultural crops. It documents:
- Water volumes delivered (gravity and pumped)
- Time period of delivery
- Breakdown by agricultural culture type
- Total irrigated area in decares
- Delivery method and location
