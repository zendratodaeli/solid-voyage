"use client";

/**
 * Waypoint List Component
 * 
 * Drag-and-drop list of voyage waypoints with add/remove functionality.
 * Supports adding strategic passages (canals/straits) as waypoint pairs.
 */

import { useState, useId } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X, Flag, CircleDot, Plus, Anchor, Ship } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PortSearchInput } from "./PortSearchInput";
import { PassageSearchInput } from "./PassageSearchInput";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Port {
  id: string;
  name: string;
  locode: string;
  country: string;
  latitude: number;
  longitude: number;
  region?: string;
  passagePolyline?: [number, number][] | null; // Pre-traced canal path
  passageDistanceNm?: number; // Accurate canal distance
}

interface Waypoint {
  id: string;
  port: Port | null;
  order: number;
}

interface WaypointListProps {
  waypoints: Waypoint[];
  onChange: (waypoints: Waypoint[]) => void;
  disabled?: boolean;
  vesselDraft?: number; // For passage safety checks
}

// Sortable Waypoint Item
function SortableWaypointItem({
  waypoint,
  index,
  total,
  onPortSelect,
  onPortClear,
  onRemove,
  disabled,
}: {
  waypoint: Waypoint;
  index: number;
  total: number;
  onPortSelect: (port: Port) => void;
  onPortClear: () => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: waypoint.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isFirst = index === 0;
  const isLast = index === total - 1;
  const canRemove = total > 2 && !isFirst;

  // Determine marker style
  const getMarkerIcon = () => {
    if (isFirst) {
      return <Anchor className="h-4 w-4 text-emerald-500" />;
    }
    if (isLast) {
      return <Flag className="h-4 w-4 text-red-500" />;
    }
    return <CircleDot className="h-4 w-4 text-amber-500" />;
  };

  const getMarkerLabel = () => {
    if (isFirst) return "Start";
    if (isLast) return "Destination";
    return `Stop ${index}`;
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 p-3 bg-card border mb-0 border-border rounded-lg",
        isDragging && "opacity-50 shadow-lg",
        disabled && "opacity-50"
      )}
    >
      {/* Drag Handle */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        disabled={disabled}
        className="cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical className="h-5 w-5 text-muted-foreground" />
      </button>

      {/* Marker Icon */}
      <div className="flex items-center gap-1.5 min-w-[80px]">
        {getMarkerIcon()}
        <span className="text-xs font-medium text-muted-foreground">
          {getMarkerLabel()}
        </span>
      </div>

      {/* Port Search or Passage Display */}
      <div className="flex-1">
        {waypoint.port?.locode === "PASSAGE" ? (
          // Passage waypoint - show read-only display
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border border-border rounded-md">
            <Ship className="h-4 w-4 text-blue-500 shrink-0" />
            <span className="text-sm font-medium truncate">
              {waypoint.port.name}
            </span>
          </div>
        ) : (
          // Regular port - show search input
          <PortSearchInput
            key={waypoint.port?.id || waypoint.id}
            value={waypoint.port}
            onSelect={onPortSelect}
            onClear={onPortClear}
            placeholder={isFirst ? "Select start port..." : "Search port..."}
            disabled={disabled}
          />
        )}
      </div>

      {/* Remove Button */}
      {canRemove && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          disabled={disabled}
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

export function WaypointList({
  waypoints,
  onChange,
  disabled = false,
  vesselDraft = 12, // Default safe draft
}: WaypointListProps) {
  const [passageDialogOpen, setPassageDialogOpen] = useState(false);
  const dndContextId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = waypoints.findIndex((w) => w.id === active.id);
      const newIndex = waypoints.findIndex((w) => w.id === over.id);

      const newWaypoints = arrayMove(waypoints, oldIndex, newIndex).map(
        (w, i) => ({ ...w, order: i })
      );
      onChange(newWaypoints);
    }
  };

  const handleAddWaypoint = () => {
    const newWaypoint: Waypoint = {
      id: `waypoint-${Date.now()}`,
      port: null,
      order: waypoints.length,
    };
    // Insert before the last item (destination)
    const newWaypoints = [
      ...waypoints.slice(0, -1),
      newWaypoint,
      waypoints[waypoints.length - 1],
    ].map((w, i) => ({ ...w, order: i }));
    onChange(newWaypoints);
  };

  const handleRemoveWaypoint = (id: string) => {
    const newWaypoints = waypoints
      .filter((w) => w.id !== id)
      .map((w, i) => ({ ...w, order: i }));
    onChange(newWaypoints);
  };

  const handlePortSelect = (waypointId: string, port: Port) => {
    const newWaypoints = waypoints.map((w) =>
      w.id === waypointId ? { ...w, port } : w
    );
    onChange(newWaypoints);
  };

  const handlePortClear = (waypointId: string) => {
    const newWaypoints = waypoints.map((w) =>
      w.id === waypointId ? { ...w, port: null } : w
    );
    onChange(newWaypoints);
  };

  // Handle passage selection - insert entry and exit as waypoints
  // Automatically determines correct order based on voyage direction
  const handlePassageSelect = (passage: {
    name: string;
    displayName: string;
    entryLat: number;
    entryLng: number;
    entryName: string;
    exitLat: number;
    exitLng: number;
    exitName: string;
    hasToll: boolean;
    polyline?: [number, number][] | null;
    distanceNm?: number;
  }) => {
    const timestamp = Date.now();
    
    // Determine voyage direction by comparing longitudes of:
    // - Previous waypoint with a port (before insertion point)
    // - Next waypoint with a port (after insertion point, i.e., destination)
    
    // Find the last waypoint with a port before the destination
    const waypointsWithPorts = waypoints.filter(w => w.port !== null);
    const lastWaypointBeforeDestination = waypointsWithPorts.length >= 2 
      ? waypointsWithPorts[waypointsWithPorts.length - 2] 
      : waypointsWithPorts[0];
    const destinationWaypoint = waypointsWithPorts[waypointsWithPorts.length - 1];
    
    // Get longitudes to determine direction
    const startLon = lastWaypointBeforeDestination?.port?.longitude ?? 0;
    const destLon = destinationWaypoint?.port?.longitude ?? 0;
    
    // Determine if voyage is West to East (increasing longitude) or East to West
    const isWestToEast = startLon < destLon;
    
    // Create waypoints with correct order based on direction
    // West to East: insert lower longitude (western) first
    // East to West: insert higher longitude (eastern) first
    const entryIsWest = passage.entryLng < passage.exitLng;
    
    // Determine which point should come first
    const firstPoint = (isWestToEast === entryIsWest) 
      ? { lat: passage.entryLat, lng: passage.entryLng, name: passage.entryName }
      : { lat: passage.exitLat, lng: passage.exitLng, name: passage.exitName };
    
    const secondPoint = (isWestToEast === entryIsWest)
      ? { lat: passage.exitLat, lng: passage.exitLng, name: passage.exitName }
      : { lat: passage.entryLat, lng: passage.entryLng, name: passage.entryName };
    
    // Determine polyline direction - reverse if needed
    let polylineForDirection = passage.polyline;
    if (polylineForDirection && (isWestToEast !== entryIsWest)) {
      // Reverse the polyline for opposite direction
      polylineForDirection = [...polylineForDirection].reverse() as [number, number][];
    }
    
    // Create first waypoint (entrance based on direction)
    // Store the polyline here so the leg calculation can use it
    const firstWaypoint: Waypoint = {
      id: `passage-first-${timestamp}`,
      port: {
        id: `${passage.name.toLowerCase().replace(/\s+/g, "-")}-first`,
        name: `${firstPoint.name} (${passage.name})`,
        locode: "PASSAGE",
        country: "Passage",
        latitude: firstPoint.lat,
        longitude: firstPoint.lng,
        passagePolyline: polylineForDirection,
        passageDistanceNm: passage.distanceNm,
      },
      order: waypoints.length,
    };
    
    // Create second waypoint (exit based on direction)
    const secondWaypoint: Waypoint = {
      id: `passage-second-${timestamp}`,
      port: {
        id: `${passage.name.toLowerCase().replace(/\s+/g, "-")}-second`,
        name: `${secondPoint.name} (${passage.name})`,
        locode: "PASSAGE",
        country: "Passage",
        latitude: secondPoint.lat,
        longitude: secondPoint.lng,
      },
      order: waypoints.length + 1,
    };
    
    // Insert before the last item (destination)
    const newWaypoints = [
      ...waypoints.slice(0, -1),
      firstWaypoint,
      secondWaypoint,
      waypoints[waypoints.length - 1],
    ].map((w, i) => ({ ...w, order: i }));
    
    onChange(newWaypoints);
    setPassageDialogOpen(false);
    
    // Show direction info in toast
    const direction = isWestToEast ? "westbound → eastbound" : "eastbound → westbound";
    
    // Show toll reminder for toll canals
    if (passage.hasToll) {
      toast.info(`🚢 ${passage.name} requires transit toll`, {
        description: `Route direction: ${direction}. Remember to add canal/toll costs.`,
      });
    } else {
      toast.success(`Added ${passage.name} to route (${direction})`);
    }
  };

  return (
    <div className="space-y-3">
      <DndContext
        id={dndContextId}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={waypoints.map((w) => w.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {waypoints.map((waypoint, index) => (
              <SortableWaypointItem
                key={waypoint.id}
                waypoint={waypoint}
                index={index}
                total={waypoints.length}
                onPortSelect={(port) => handlePortSelect(waypoint.id, port)}
                onPortClear={() => handlePortClear(waypoint.id)}
                onRemove={() => handleRemoveWaypoint(waypoint.id)}
                disabled={disabled}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Action Buttons */}
      <div className="flex flex-col gap-2">
        {/* Add Waypoint Button */}
        <Button
          type="button"
          variant="outline"
          onClick={handleAddWaypoint}
          disabled={disabled}
          className="flex-1 border-dashed"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Waypoint
        </Button>

        {/* Add Passage Button */}
        <Dialog open={passageDialogOpen} onOpenChange={setPassageDialogOpen}>
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              className="flex-1 border-dashed"
            >
              <Ship className="h-4 w-4 mr-2" />
              Add Passage
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Strategic Passage</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Search canals and straits to add to your route.
              </p>
              <PassageSearchInput
                onSelect={handlePassageSelect}
                vesselDraft={vesselDraft}
                placeholder="Search Kiel, Suez, Malacca..."
              />
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

// Initialize default waypoints
export function createInitialWaypoints(): Waypoint[] {
  return [
    { id: "waypoint-start", port: null, order: 0 },
    { id: "waypoint-end", port: null, order: 1 },
  ];
}
