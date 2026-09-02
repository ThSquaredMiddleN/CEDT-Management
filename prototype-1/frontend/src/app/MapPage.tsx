import { useState } from "react";

const buildings = [
  {
    id: "ENG3",
    name: "อาคาร3",
    points: 
      "19.88,11.30 38.88,11.72 38.88,10.46 43.38,10.46 43.38,20.36 46.50,20.36 46.63,19.11 47.75,19.11 47.75,17.02 52.25,16.88 52.25,18.97 53.37,18.97 53.37,20.22 56.63,20.50 56.63,10.46 61.12,10.46 61.12,11.44 77.50,11.58 77.50,20.64 73.88,20.78 73.88,17.57 72.13,17.57 72.13,16.60 61.12,16.46 61.12,21.34 62.00,21.34 62.00,24.83 61.25,24.83 60.88,29.15 56.13,29.15 56.13,29.99 53.13,30.26 53.13,29.43 47.88,29.29 47.88,30.26 44.00,30.13 44.00,29.15 38.88,29.15 38.75,16.46 23.63,16.74 23.50,20.78 20.00,20.78"
  }
]

export function MapPage() {
  const [hoveredBuilding, setHoveredBuilding] = useState<string | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<string | null>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });


  return (
    <main className="min-h-[calc(100vh-4rem)] bg-neutral-50 p-6">
      <div className="mx-auto max-w-7xl">
        <h1 className="mb-6 text-2xl font-semibold text-neutral-900">
          Schedule A
        </h1>

        <div
          className="relative inline-block w-full"
          onMouseMove={(e) => {
            setMousePosition({
              x: e.clientX,
              y: e.clientY,
            });
          }}
        >
          {/* แผนที่ */}
          <img
            src="/maps/map-1.png"
            alt="Schedule A map"
            className="block w-full"
          />

          {/* พื้นที่อาคาร */}
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {buildings.map((building) => (
              <polygon
                  key={building.id}
                  points={building.points}
                  fill="transparent"
                  stroke="transparent"
                  className="cursor-pointer hover:fill-blue-500/20"
                  onMouseEnter={() => setHoveredBuilding(building.id)}
                  onMouseLeave={() => setHoveredBuilding(null)}
                  onClick={() => setSelectedBuilding(building.id)}
              />
            ))}
          </svg>
        </div>

        {/* Popup */}
        {hoveredBuilding !== null && (
          <div
            className="fixed z-50 rounded-lg border bg-white px-4 py-3 shadow-lg"
            style={{
              left: mousePosition.x + 15,
              top: mousePosition.y + 15,
            }}
          >
            <div className="font-semibold">
              {
                buildings.find(
                  (building) => building.id === hoveredBuilding
                )?.name
              }
            </div>

            <div className="text-sm text-neutral-500">
              คลิกเพื่อดูรายละเอียด
            </div>
          </div>
        )}

      </div>

      {selectedBuilding !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
          onClick={() => setSelectedBuilding(null)}
        >
          <div
            className="w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* เอาข้อมูลอาคารที่ถูกเลือกมา */}
            {(() => {
              const building = buildings.find(
                (b) => b.id === selectedBuilding
              );

              if (!building) return null;

              return (
                <>
                  {/* หัวข้อ */}
                  <div className="mb-6 flex items-start justify-between">
                    <div>
                      <p className="text-sm text-neutral-500">
                        {building.id}
                      </p>

                      <h2 className="text-2xl font-semibold">
                        {building.name}
                      </h2>
                    </div>

                    <button
                      onClick={() => setSelectedBuilding(null)}
                      className="text-2xl text-neutral-400 hover:text-neutral-900"
                    >
                      ×
                    </button>
                  </div>

                  {/* รูป + ข้อมูล */}
                  <div className="grid gap-6 md:grid-cols-2">
                    <img
                      src="/maps/map-1.png"
                      alt={building.name}
                      className="h-64 w-full rounded-xl border object-cover"
                    />

                    <div className="space-y-4">
                      <div>
                        <p className="text-sm text-neutral-500">
                          ชื่ออาคาร
                        </p>
                        <p className="font-medium">
                          {building.name}
                        </p>
                      </div>

                      <div>
                        <p className="text-sm text-neutral-500">
                          ชั้น
                        </p>
                        <p className="font-medium">
                          ชั้น 1, 2, 3
                        </p>
                      </div>

                      <div>
                        <p className="text-sm text-neutral-500">
                          ห้อง
                        </p>
                        <p className="font-medium">
                          101, 102, 103, 201, 202, 301
                        </p>
                      </div>

                      <div>
                        <p className="text-sm text-neutral-500">
                          เวลา
                        </p>
                        <p className="font-medium">
                          08:00 - 17:00 น.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* รายละเอียด */}
                  <div className="mt-6 rounded-xl bg-neutral-50 p-4">
                    <p className="mb-2 font-medium">
                      รายละเอียด
                    </p>

                    <p className="text-sm leading-6 text-neutral-600">
                      อาคารสำหรับการเรียนการสอนและกิจกรรมทางวิศวกรรม
                      ภายในอาคารประกอบด้วยห้องเรียน
                      ห้องปฏิบัติการ และพื้นที่สำหรับนักศึกษาและอาจารย์
                    </p>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

    </main>
  );
}

