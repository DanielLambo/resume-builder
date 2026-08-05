import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type StudioUiState = {
  promptDraft: string;
};

const initialState: StudioUiState = {
  promptDraft: "",
};

const studioSlice = createSlice({
  name: "studio",
  initialState,
  reducers: {
    setPromptDraft(state, action: PayloadAction<string>) {
      state.promptDraft = action.payload;
    },
    clearPromptDraft(state) {
      state.promptDraft = "";
    },
  },
});

export const { setPromptDraft, clearPromptDraft } = studioSlice.actions;
export const studioReducer = studioSlice.reducer;
