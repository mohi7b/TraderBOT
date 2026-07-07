export default function MobileLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col p-2 bg-black text-white">
      {children}
    </div>
  )
}
