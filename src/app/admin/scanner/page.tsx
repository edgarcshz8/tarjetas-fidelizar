import QRScannerClient from '@/components/QRScannerClient'

export default function ScannerPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Escanear Tarjeta</h1>
        <p className="text-gray-500">Escanea el QR de la tarjeta del cliente para agregar un sello</p>
      </div>
      <QRScannerClient />
    </div>
  )
}
