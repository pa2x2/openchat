import { createContext, useContext } from "react";

export interface DrawerControls {
  openDrawer: () => void;
  closeDrawer: () => void;
}

const noop = () => undefined;

export const DrawerContext = createContext<DrawerControls>({ openDrawer: noop, closeDrawer: noop });

export function useDrawer(): DrawerControls {
  return useContext(DrawerContext);
}
