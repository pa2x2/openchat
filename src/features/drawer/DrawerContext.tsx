import { createContext, useContext } from "react";

export interface DrawerControls {
  openDrawer: () => void;
  closeDrawer: () => void;
}

const noop = () => undefined;

export const DrawerContext = createContext<DrawerControls>({ openDrawer: noop, closeDrawer: noop });

/** Opens/closes the chat sidebar from anywhere inside the main layout. */
export function useDrawer(): DrawerControls {
  return useContext(DrawerContext);
}
