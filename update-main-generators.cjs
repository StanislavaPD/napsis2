const fs = require('fs');

const generatorsPath = 'd:/New folder/napsis/src/components/Generators.tsx';
const content = fs.readFileSync(generatorsPath, 'utf8');

// Find the main Generators export
const startMarker = '// ─── MAIN GENERATORS PAGE ─────────────────────────────────────────────────────';
const startIdx = content.indexOf(startMarker);

if (startIdx === -1) {
  console.error('Could not find MAIN GENERATORS PAGE marker');
  process.exit(1);
}

// Everything before the main component stays
const before = content.substring(0, startIdx);

// New main component with UDVN support
const newMainComponent = `// ─── MAIN GENERATORS PAGE ─────────────────────────────────────────────────────
export default function Generators({ defaultTab }: { defaultTab?: 'contract' | 'act' | 'request' | 'udvn-upcoming' | 'udvn-completed' | 'odz-letter' | 'protocol' }) {
  // Category state: napoyavane or udvn
  const [category, setCategory] = useState<'napoyavane' | 'udvn'>('napoyavane')

  // Napoyavane tabs
  const [napoyavaneTab, setNapoyavaneTab] = useState<'contract' | 'act' | 'request'>('contract')

  // UDVN tabs
  const [udvnTab, setUdvnTab] = useState<'upcoming' | 'completed' | 'odz-letter' | 'protocol'>('upcoming')

  // UDVN state for all generators
  const [udvnMonth, setUdvnMonth] = useState('Януари')
  const [udvnReportDate, setUdvnReportDate] = useState('')
  const [udvnFacilities, setUdvnFacilities] = useState<UdvnFacility[]>([{ ...EMPTY_FACILITY }])
  const [udvnLetterDate, setUdvnLetterDate] = useState('')
  const [udvnProtocolNumber, setUdvnProtocolNumber] = useState('')
  const [udvnProtocolDate, setUdvnProtocolDate] = useState('')

  // Handle default tab routing
  useState(() => {
    if (defaultTab === 'udvn-upcoming' || defaultTab === 'udvn-completed' || defaultTab === 'odz-letter' || defaultTab === 'protocol') {
      setCategory('udvn')
      if (defaultTab === 'udvn-upcoming') setUdvnTab('upcoming')
      else if (defaultTab === 'udvn-completed') setUdvnTab('completed')
      else if (defaultTab === 'odz-letter') setUdvnTab('odz-letter')
      else if (defaultTab === 'protocol') setUdvnTab('protocol')
    } else if (defaultTab) {
      setCategory('napoyavane')
      setNapoyavaneTab(defaultTab as 'contract' | 'act' | 'request')
    }
  })

  const napoyavaneTabs = [
    { id: 'contract', label: 'Договор' },
    { id: 'act', label: 'Акт' },
    { id: 'request', label: 'Заявка' },
  ] as const

  const udvnTabs = [
    { id: 'upcoming', label: 'Предстоящи ремонти' },
    { id: 'completed', label: 'Извършени ремонти' },
    { id: 'odz-letter', label: 'Писмо до ОДЗ' },
    { id: 'protocol', label: 'Протокол' },
  ] as const

  return (
    <div className="flex flex-col h-full">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-gray-900">Генератори на документи</h1>
        <p className="text-sm text-gray-500 mt-0.5">Попълнете критериите и прегледайте документа преди запазване</p>
      </div>

      {/* Category selector */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setCategory('napoyavane')}
          className={\`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all \${category === 'napoyavane' ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}\`}
        >
          <WaterDropIcon className="w-4 h-4" />
          Напояване
        </button>
        <button
          onClick={() => setCategory('udvn')}
          className={\`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all \${category === 'udvn' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}\`}
        >
          <ToolsIcon className="w-4 h-4" />
          УДВН
        </button>
      </div>

      {/* Napoyavane tabs */}
      {category === 'napoyavane' && (
        <>
          <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
            {napoyavaneTabs.map(t => (
              <button
                key={t.id}
                onClick={() => setNapoyavaneTab(t.id)}
                className={\`px-5 py-2 rounded-lg text-sm font-medium transition-all \${napoyavaneTab === t.id ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}\`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex-1 min-h-0">
            {napoyavaneTab === 'contract' && <ContractGenerator />}
            {napoyavaneTab === 'act' && <ActGenerator />}
            {napoyavaneTab === 'request' && <RequestGenerator />}
          </div>
        </>
      )}

      {/* UDVN tabs */}
      {category === 'udvn' && (
        <>
          <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit flex-wrap">
            {udvnTabs.map(t => (
              <button
                key={t.id}
                onClick={() => setUdvnTab(t.id)}
                className={\`px-4 py-2 rounded-lg text-sm font-medium transition-all \${udvnTab === t.id ? 'bg-white text-amber-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}\`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            {udvnTab === 'upcoming' && (
              <UdvnUpcomingGenerator
                month={udvnMonth}
                setMonth={setUdvnMonth}
                reportDate={udvnReportDate}
                setReportDate={setUdvnReportDate}
                facilities={udvnFacilities}
                setFacilities={setUdvnFacilities}
              />
            )}
            {udvnTab === 'completed' && (
              <UdvnCompletedGenerator
                month={udvnMonth}
                setMonth={setUdvnMonth}
                reportDate={udvnReportDate}
                setReportDate={setUdvnReportDate}
                facilities={udvnFacilities}
                setFacilities={setUdvnFacilities}
              />
            )}
            {udvnTab === 'odz-letter' && (
              <OdzLetterGenerator
                letterDate={udvnLetterDate}
                setLetterDate={setUdvnLetterDate}
                facilities={udvnFacilities}
                setFacilities={setUdvnFacilities}
              />
            )}
            {udvnTab === 'protocol' && (
              <ProtocolGenerator
                protocolNumber={udvnProtocolNumber}
                setProtocolNumber={setUdvnProtocolNumber}
                protocolDate={udvnProtocolDate}
                setProtocolDate={setUdvnProtocolDate}
                facilities={udvnFacilities}
                setFacilities={setUdvnFacilities}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}
`;

const newContent = before + newMainComponent;
fs.writeFileSync(generatorsPath, newContent, 'utf8');
console.log('✅ Updated main Generators component with UDVN category and tabs');
