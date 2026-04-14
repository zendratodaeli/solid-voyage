"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Users, Anchor, TrendingUp, ChevronDown, LayoutGrid, Crown } from "lucide-react";
import { ViewLens, VIEW_LENS_CONFIGS } from "@/types";
import { useViewLens } from "./ViewLensContext";

const lensIcons: Record<ViewLens, React.ReactNode> = {
  shipbroker: <Users className="h-4 w-4" />,
  operator: <Anchor className="h-4 w-4" />,
  management: <TrendingUp className="h-4 w-4" />,
  show_all: <LayoutGrid className="h-4 w-4" />,
};

interface ViewLensSelectorProps {
  isAdmin?: boolean;
}

export function ViewLensSelector({ isAdmin = false }: ViewLensSelectorProps) {
  const { currentLens, setCurrentLens } = useViewLens();
  const config = VIEW_LENS_CONFIGS[currentLens];

  const availableLenses = (Object.keys(VIEW_LENS_CONFIGS) as ViewLens[]).filter(
    (lens) => !VIEW_LENS_CONFIGS[lens].adminOnly || isAdmin
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          {lensIcons[currentLens]}
          <span className="hidden sm:inline">{config.label}</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>View Perspective</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {availableLenses.map((lens) => {
          const lensConfig = VIEW_LENS_CONFIGS[lens];
          const isActive = lens === currentLens;
          return (
            <DropdownMenuItem
              key={lens}
              onClick={() => setCurrentLens(lens)}
              className={isActive ? "bg-primary/10" : ""}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 ${isActive ? "text-primary" : ""}`}>
                  {lensIcons[lens]}
                </div>
                <div className="flex-1">
                  <div className={`font-medium flex items-center gap-1.5 ${isActive ? "text-primary" : ""}`}>
                    {lensConfig.label}
                    {lensConfig.adminOnly && (
                      <Crown className="h-3 w-3 text-amber-400" />
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {lensConfig.description}
                  </div>
                </div>
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
