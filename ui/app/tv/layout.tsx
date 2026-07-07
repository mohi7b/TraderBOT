export default function TVLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="p-10 bg-black text-white text-3xl">
      {children}
    </div>
  )
}
