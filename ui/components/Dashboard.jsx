export default function Dashboard({ live }) {
  return (
    <div className="grid grid-cols-3 gap-4 mt-4">
      <div className="bg-black/40 p-4 rounded-lg">
        <h2 className="text-lg font-bold mb-2">Price</h2>
        <div className="text-2xl text-green-400">
          {live?.price || "—"}
        </div>
      </div>

      <div className="bg-black/40 p-4 rounded-lg">
        <h2 className="text-lg font-bold mb-2">Magnet</h2>
        <pre className="text-sm">
          {JSON.stringify(live?.magnet, null, 2)}
        </pre>
      </div>

      <div className="bg-black/40 p-4 rounded-lg">
        <h2 className="text-lg font-bold mb-2">Fake Walls</h2>
        <pre className="text-sm">
          {JSON.stringify(live?.fakeWalls, null, 2)}
        </pre>
      </div>

      <div className="bg-black/40 p-4 rounded-lg col-span-3">
        <h2 className="text-lg font-bold mb-2">Alerts</h2>
        <pre className="text-sm">
          {JSON.stringify(live?.alerts, null, 2)}
        </pre>
      </div>
    </div>
  );
}
