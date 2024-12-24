import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export type ConnectionStatus = "disconnected" | "connecting" | "ready";
export type StreamingMode = "lowLatency" | "performance";

export interface SettingsState {
  discordToken: string;
  urlBarEnabled: boolean;
  remoteEnabled: boolean;
  remoteAddress: string;
  remotePort: string;
  externalInputsEnabled: boolean;
  multipleInputsEnabled: boolean;
  multipleOutputsEnabled: boolean;
  streamingMode: StreamingMode;
}

const initialState: SettingsState = {
  discordToken: process.env.MIKU_TOKEN,
  urlBarEnabled: true,
  remoteEnabled: true,
  remoteAddress: "127.0.0.1",
  remotePort: "3333",
  externalInputsEnabled: false,
  multipleInputsEnabled: false,
  multipleOutputsEnabled: false,
  streamingMode: "performance",
};

export const connectionSlice = createSlice({
  name: "settings",
  initialState,
  reducers: {
    setDiscordToken: (state, action: PayloadAction<string>) => {
      state.discordToken = action.payload;
    },
    setURLBarEnabled: (state, action: PayloadAction<boolean>) => {
      state.urlBarEnabled = action.payload;
    },
    setRemoteEnabled: (state, action: PayloadAction<boolean>) => {
      state.remoteEnabled = action.payload;
    },
    setRemoteAddress: (state, action: PayloadAction<string>) => {
      state.remoteAddress = action.payload;
    },
    setRemotePort: (state, action: PayloadAction<string>) => {
      state.remotePort = action.payload;
    },
    setExternalInputsEnabled: (state, action: PayloadAction<boolean>) => {
      state.externalInputsEnabled = action.payload;
    },
    setMultipleInputsEnabled: (state, action: PayloadAction<boolean>) => {
      state.multipleInputsEnabled = action.payload;
    },
    setMultipleOutputsEnabled: (state, action: PayloadAction<boolean>) => {
      state.multipleOutputsEnabled = action.payload;
    },
    setStreamingMode: (state, action: PayloadAction<StreamingMode>) => {
      state.streamingMode = action.payload;
    },
  },
});

export const {
  setDiscordToken,
  setURLBarEnabled,
  setRemoteEnabled,
  setRemoteAddress,
  setRemotePort,
  setExternalInputsEnabled,
  setMultipleInputsEnabled,
  setMultipleOutputsEnabled,
  setStreamingMode,
} = connectionSlice.actions;

export default connectionSlice.reducer;
