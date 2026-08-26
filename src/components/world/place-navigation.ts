/**
 * Collider + NavMesh por lugar — bootstrap ao mudar activePlaceId.
 * Scan: setScanCollision no load do GLB completa a grelha.
 */
import type { Place } from "@/lib/places";
import { DEFAULT_METRICS } from "@/lib/room-metrics";
import { setCollisionMode } from "./collision";
import { clearNavMesh, setNavMeshFromWalkRects } from "./navmesh";
import type { Rect } from "./collision";

const GARDEN_WALK: Rect[] = [{ x0: -10, x1: 10, z0: -10, z1: 12 }];

export function bootstrapPlaceNavigation(place: Place | undefined) {
  if (!place) {
    setCollisionMode("oliveira");
    return;
  }

  switch (place.layout) {
    case "simple-room":
      setCollisionMode("simple-room", place.metrics ?? DEFAULT_METRICS);
      break;
    case "garden-only":
      setCollisionMode("open");
      setNavMeshFromWalkRects(GARDEN_WALK, 0.5);
      // open mode clears navmesh — repor jardim
      setNavMeshFromWalkRects(GARDEN_WALK, 0.5);
      break;
    case "scan-glb":
      // Fallback até o GLB: simple-room metrics se existirem
      if (place.metrics) {
        setCollisionMode("simple-room", place.metrics);
      } else {
        setCollisionMode("simple-room", DEFAULT_METRICS);
      }
      // mode será "scan" quando ScannedPlace chamar setScanCollision
      break;
    case "oliveira-house":
    default:
      setCollisionMode("oliveira");
      break;
  }

  if (typeof window !== "undefined") {
    (window as unknown as { __placeNav?: string }).__placeNav = `${place.id}:${place.layout}`;
  }
}

export function teardownPlaceNavigation() {
  clearNavMesh();
  setCollisionMode("oliveira");
}
