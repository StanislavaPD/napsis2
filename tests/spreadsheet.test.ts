import { describe, expect, it } from 'vitest'
import { cellToNum, namesMatch, parseSpreadsheetFile, rowGet } from '../src/lib/spreadsheet'

describe('spreadsheet helpers', () => {
  it('parses Bulgarian and mixed numeric formats', () => {
    expect(cellToNum('1 234,56')).toBe(1234.56)
    expect(cellToNum('1.234,56 €')).toBe(1234.56)
    expect(cellToNum('1,234.56')).toBe(1234.56)
    expect(cellToNum('0,0128')).toBe(0.0128)
    expect(cellToNum('not-a-number')).toBe(0)
  })

  it('matches headers with BOM, currency suffixes and whitespace', () => {
    const row = { '\uFEFF Ед. цена (€) ': '0,0800', 'Бр. поливки': 4 }
    expect(rowGet(row, 'Ед. цена')).toBe('0,0800')
    expect(rowGet(row, 'Брой поливки', 'Бр. поливки')).toBe(4)
  })

  it('matches equivalent reference names without changing values', () => {
    expect(namesMatch('Гравитачно напояване', 'Гравитачно')).toBe(true)
    expect(namesMatch('Гравитачно', 'Помпено')).toBe(false)
  })

  it('parses semicolon CSV with quoted commas', async () => {
    const file = new File([
      '\uFEFFКонтрагент;Сума;Бележка\r\n"Фирма, ООД";"1 234,56";"Ред 1\nРед 2"\r\n',
    ], 'import.csv', { type: 'text/csv' })
    await expect(parseSpreadsheetFile(file)).resolves.toEqual([
      { Контрагент: 'Фирма, ООД', Сума: '1 234,56', Бележка: 'Ред 1\nРед 2' },
    ])
  })
})
