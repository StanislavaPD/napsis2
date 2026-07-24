export interface Contractor {
  id: string
  name: string
  bulstat: string
  address: string
  contact: string
  phone: string
  iban: string
  entityType: 'legal' | 'individual' | 'farmer'
  vatRegistered: boolean
  vatNumber: string
  egn: string
  idCardNumber: string
  idCardIssuedDate: string
  hasProxy: boolean
  proxyName: string
  proxyEgn: string
  notaryDeedNumber: string
  notaryName: string
  notaryJurisdiction: string
}

export interface HTU {
  id: string
  htuName: string
  equipment: string
  village: string
}

export interface IrrigationMethod {
  id: string
  name: string
}

export interface Crop {
  id: string
  name: string
}

export interface Contract {
  id: string
  date: string
  number: string
  contractorId: string
  htuId: string
  village: string
  irrigationMethodId: string
  cropId: string
  area: number
  irrigationCount: number
  totalDka: number
  cubicPerDka: number
  waterCubic: number
  unitPrice: number
  value: number
  irrigationNumber: string
  month: string
}

export interface Act {
  id: string
  docType: string
  date: string
  number: string
  contractorId: string
  htuId: string
  village: string
  irrigationMethodId: string
  cropId: string
  irrigationNumber: string
  area: number
  cubicPerDka: number
  waterCubic: number
  unitPrice: number
  value: number
  month: string
}

export interface IrrigRequest {
  id: string
  contractorId: string
  irrigationNumber: string
  startDate: string
  endDate: string
  items: { cropId: string; area: number }[]
}

export interface Payment {
  id: string
  invoiceNumber: string
  contractorId: string
  items: { cropId: string; area: number }[]
  amount: number
  paid: boolean
}

export type Module =
  | 'dashboard'
  | 'contractors'
  | 'htu'
  | 'methods'
  | 'contracts'
  | 'acts'
  | 'requests'
  | 'payments'
  | 'reports'
  | 'gen-contract'
  | 'gen-act'
  | 'gen-request'
