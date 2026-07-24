import { useState } from 'react'
import { useStore } from '../store'
import type { IrrigationMethod, Crop } from '../types'
import {
  Modal,
  Btn,
  FormRow,
  Input,
  SearchBar,
  ConfirmDialog,
  PageHeader,
  EmptyState,
  Card,
  ImportButton,
  ImportResultModal,
  EditIcon,
  TrashIcon
} from './ui'
import { parseSpreadsheetFile, findByField, rowGet } from '../lib/spreadsheet'

function MethodList() {

  const {
    irrigationMethods,
    setIrrigationMethods
  } = useStore()


  const [search,setSearch] = useState('')
  const [adding,setAdding] = useState(false)
  const [editing,setEditing] =
    useState<IrrigationMethod|null>(null)

  const [name,setName] = useState('')
  const [deleteId,setDeleteId] =
    useState<string|null>(null)

  const [importResult,setImportResult] =
    useState<{added:number,errors:string[]}|null>(null)



  const filtered =
    irrigationMethods.filter(m =>
      m.name
      .toLowerCase()
      .includes(search.toLowerCase())
    )



  function save(){

    if(!name.trim())
      return


    if(adding){

      setIrrigationMethods([
        ...irrigationMethods,
        {
          id: Date.now().toString(),
          name
        }
      ])

      setAdding(false)

    }
    else if(editing){

      setIrrigationMethods(
        irrigationMethods.map(m =>
          m.id === editing.id
          ?
          {
            ...m,
            name
          }
          :
          m
        )
      )

      setEditing(null)

    }

  }




  async function handleImport(file: File){

    const rows = await parseSpreadsheetFile(file)

    const errors: string[] = []
    const added: IrrigationMethod[] = []

    rows.forEach((row,i)=>{

      const rowNum = i + 2
      const name = String(rowGet(row,'Наименование','name') ?? '').trim()

      if(!name){
        errors.push(`Ред ${rowNum}: липсва наименование`)
        return
      }

      if(
        findByField(irrigationMethods,'name',name)
        ||
        findByField(added,'name',name)
      ){
        errors.push(`Ред ${rowNum}: начин на напояване "${name}" вече съществува`)
        return
      }

      added.push({
        id: `${Date.now()}-${i}`,
        name
      })

    })

    if(added.length)
      setIrrigationMethods([
        ...irrigationMethods,
        ...added
      ])

    setImportResult({ added: added.length, errors })

  }



  function confirmDelete(){

    if(deleteId){

      setIrrigationMethods(
        irrigationMethods.filter(
          m=>m.id!==deleteId
        )
      )

      setDeleteId(null)

    }

  }



  const isOpen =
    adding || editing !== null



  return (

    <div>

      <div className="flex items-center justify-between mb-4">

        <p className="text-sm text-gray-500">
          {irrigationMethods.length} записа
        </p>


        <div className="flex gap-2">

          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Търсене..."
          />


          <ImportButton onFile={handleImport} />


          <Btn
            onClick={()=>{
              setName('')
              setAdding(true)
            }}
          >
            + Добави
          </Btn>

        </div>

      </div>


      <Card>

        <div className="overflow-x-auto">

          <table className="w-full text-sm">

            <thead>

              <tr className="bg-gradient-to-br from-amber-400 to-amber-500">

                <th className="text-left px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide">
                  Наименование
                </th>

                <th className="text-left px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide">
                  Действия
                </th>

              </tr>

            </thead>


            <tbody>

              {
                filtered.length===0
                ?
                <tr>
                  <td colSpan={2}>
                    <EmptyState message="Няма записи"/>
                  </td>
                </tr>

                :

                filtered.map((m,i)=>(

                  <tr
                    key={m.id}
                    className={`border-b border-gray-50 hover:bg-teal-50/30 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50/40'}`}
                  >

                    <td className="px-4 py-3 font-medium text-gray-900">
                      {m.name}
                    </td>


                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">

                        <Btn
                          size="sm"
                          variant="ghost"
                          onClick={()=>{
                            setName(m.name)
                            setEditing(m)
                          }}
                        >
                          <EditIcon/>
                        </Btn>


                        <Btn
                          size="sm"
                          variant="ghost"
                          onClick={()=>
                            setDeleteId(m.id)
                          }
                        >
                          <TrashIcon/>
                        </Btn>

                      </div>
                    </td>

                  </tr>

                ))

              }

            </tbody>

          </table>

        </div>

      </Card>

      {isOpen && (

        <Modal
          title={
            adding
            ?
            'Нов начин на напояване'
            :
            'Редактирай начин на напояване'
          }

          onClose={()=>{
            setAdding(false)
            setEditing(null)
          }}
        >

          <FormRow
            label="Наименование"
            required
          >

            <Input
              value={name}
              onChange={e=>setName(e.target.value)}
              placeholder="Дъждуване"
            />

          </FormRow>


          <div className="flex gap-3 justify-end mt-6">

            <Btn
              variant="secondary"
              onClick={()=>{
                setAdding(false)
                setEditing(null)
              }}
            >
              Откажи
            </Btn>


            <Btn
              onClick={save}
              disabled={!name.trim()}
            >
              Запази
            </Btn>

          </div>


        </Modal>

      )}



      {deleteId && (

        <ConfirmDialog

          message="Сигурни ли сте, че искате да изтриете този начин на напояване?"

          onConfirm={confirmDelete}

          onCancel={()=>
            setDeleteId(null)
          }

        />

      )}


      {importResult && (

        <ImportResultModal
          added={importResult.added}
          errors={importResult.errors}
          onClose={()=>setImportResult(null)}
        />

      )}


    </div>

  )

}







function CropList(){

  const {
    crops,
    setCrops
  } = useStore()


  const [search,setSearch]=useState('')
  const [adding,setAdding]=useState(false)

  const [editing,setEditing]=
    useState<Crop|null>(null)

  const [name,setName]=useState('')

  const [deleteId,setDeleteId]=
    useState<string|null>(null)

  const [importResult,setImportResult] =
    useState<{added:number,errors:string[]}|null>(null)



  const filtered =
    crops.filter(c=>
      c.name
      .toLowerCase()
      .includes(search.toLowerCase())
    )




  function save(){

    if(!name.trim())
      return


    if(adding){

      setCrops([
        ...crops,
        {
          id:Date.now().toString(),
          name
        }
      ])

      setAdding(false)

    }
    else if(editing){

      setCrops(
        crops.map(c=>
          c.id===editing.id
          ?
          {
            ...c,
            name
          }
          :
          c
        )
      )

      setEditing(null)

    }

  }







  async function handleImport(file: File){

    const rows = await parseSpreadsheetFile(file)

    const errors: string[] = []
    const added: Crop[] = []

    rows.forEach((row,i)=>{

      const rowNum = i + 2
      const name = String(rowGet(row,'Култура','Наименование','name') ?? '').trim()

      if(!name){
        errors.push(`Ред ${rowNum}: липсва наименование`)
        return
      }

      if(
        findByField(crops,'name',name)
        ||
        findByField(added,'name',name)
      ){
        errors.push(`Ред ${rowNum}: култура "${name}" вече съществува`)
        return
      }

      added.push({
        id: `${Date.now()}-${i}`,
        name
      })

    })

    if(added.length)
      setCrops([
        ...crops,
        ...added
      ])

    setImportResult({ added: added.length, errors })

  }





  function confirmDelete(){

    if(deleteId){

      setCrops(
        crops.filter(
          c=>c.id!==deleteId
        )
      )

      setDeleteId(null)

    }

  }




  const isOpen =
    adding || editing!==null



  return (

    <div>


      <div className="flex items-center justify-between mb-4">


        <p className="text-sm text-gray-500">
          {crops.length} записа
        </p>


        <div className="flex gap-2">


          <SearchBar

            value={search}

            onChange={setSearch}

            placeholder="Търсене..."

          />



          <ImportButton onFile={handleImport} />



          <Btn

            onClick={()=>{

              setName('')
              setAdding(true)

            }}

          >
            + Добави
          </Btn>


        </div>


      </div>




      <Card>

        <div className="overflow-x-auto">

          <table className="w-full text-sm">


            <thead>

              <tr className="bg-gradient-to-br from-amber-400 to-amber-500">


                <th className="text-left px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide">
                  Култура
                </th>


                <th className="text-left px-4 py-3 text-xs font-semibold text-white uppercase tracking-wide">
                  Действия
                </th>


              </tr>


            </thead>



            <tbody>


              {
                filtered.length===0

                ?

                <tr>

                  <td colSpan={2}>

                    <EmptyState message="Няма култури"/>

                  </td>

                </tr>


                :


                filtered.map((c,i)=>(


                  <tr
                    key={c.id}
                    className={`border-b border-gray-50 hover:bg-teal-50/30 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50/40'}`}
                  >


                    <td className="px-4 py-3 font-medium text-gray-900">
                      {c.name}
                    </td>


                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">


                        <Btn
                          size="sm"
                          variant="ghost"
                          onClick={()=>{

                            setName(c.name)
                            setEditing(c)

                          }}
                        >
                          <EditIcon/>
                        </Btn>



                        <Btn
                          size="sm"
                          variant="ghost"
                          onClick={()=>
                            setDeleteId(c.id)
                          }
                        >
                          <TrashIcon/>
                        </Btn>


                      </div>
                    </td>


                  </tr>


                ))

              }


            </tbody>


          </table>

        </div>


      </Card>

      {isOpen && (

        <Modal

          title={
            adding
            ?
            'Нова култура'
            :
            'Редактирай култура'
          }


          onClose={()=>{

            setAdding(false)
            setEditing(null)

          }}

        >


          <FormRow

            label="Наименование"

            required

          >


            <Input

              value={name}

              onChange={e=>setName(e.target.value)}

              placeholder="Царевица"

            />


          </FormRow>



          <div className="flex gap-3 justify-end mt-6">


            <Btn

              variant="secondary"

              onClick={()=>{

                setAdding(false)
                setEditing(null)

              }}

            >

              Откажи

            </Btn>



            <Btn

              onClick={save}

              disabled={!name.trim()}

            >

              Запази

            </Btn>


          </div>


        </Modal>


      )}




      {deleteId && (


        <ConfirmDialog


          message="Сигурни ли сте, че искате да изтриете тази култура?"


          onConfirm={confirmDelete}


          onCancel={()=>

            setDeleteId(null)

          }


        />


      )}


      {importResult && (

        <ImportResultModal
          added={importResult.added}
          errors={importResult.errors}
          onClose={()=>setImportResult(null)}
        />

      )}


    </div>

  )

}








export default function Methods(){


  const [tab,setTab] =
    useState<'methods'|'crops'>('methods')



  return (

    <div>


      <PageHeader

        title="Начин на напояване и Култури"

      />



      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">


        <button

          onClick={()=>setTab('methods')}

          className={`
            px-5 py-2 rounded-lg text-sm font-medium
            ${
              tab==='methods'
              ?
              'bg-white text-teal-700 shadow-sm'
              :
              'text-gray-600'
            }
          `}

        >

          Начин на напояване

        </button>




        <button

          onClick={()=>setTab('crops')}

          className={`
            px-5 py-2 rounded-lg text-sm font-medium
            ${
              tab==='crops'
              ?
              'bg-white text-teal-700 shadow-sm'
              :
              'text-gray-600'
            }
          `}

        >

          Култури

        </button>


      </div>




      {
        tab==='methods'

        ?

        <MethodList/>

        :

        <CropList/>

      }



    </div>

  )

}