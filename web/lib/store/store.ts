import { configureStore } from "@reduxjs/toolkit";

import { studioReducer } from "@/lib/store/studioSlice";

export const makeStore = () =>
  configureStore({
    reducer: {
      studio: studioReducer,
    },
  });

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
