export default function DesktopLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-2 gap-4 p-4 bg-gray-900 text-white">
      {children}
    </div>
  )
}
