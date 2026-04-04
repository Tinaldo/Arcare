"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";
import {
  createUser,
  getUserToken,
  initializeUser,
  listWallets,
  getTokenBalance,
} from "@/lib/circle-api";

const APP_ID = process.env.NEXT_PUBLIC_CIRCLE_APP_ID as string;

const SESSION = {
  userToken:     "insurarc_userToken",
  encryptionKey: "insurarc_encKey",
  wallet:        "insurarc_wallet",
};

export interface CircleWallet {
  id: string;
  address: string;
  blockchain: string;
}

export interface CircleWalletState {
  sdkRef: React.RefObject<W3SSdk | null>;
  sdkReady: boolean;
  isConnected: boolean;
  wallet: CircleWallet | null;
  userToken: string | null;
  encryptionKey: string | null;
  usdcBalance: string | null;
  userId: string | null;
  showModal: boolean;
  modalMode: "signin" | "signup";
  openModal: (mode?: "signin" | "signup") => void;
  closeModal: () => void;
  disconnect: () => void;
  executeChallenge: (challengeId: string) => Promise<void>;
  // Modal step handlers (called from WalletModal)
  handleCreateUser: (userId: string) => Promise<{ error?: string }>;
  handleGetToken: (userId: string) => Promise<{ error?: string; userToken?: string; encryptionKey?: string }>;
  handleInitialize: (userToken: string) => Promise<{ challengeId?: string; error?: string; alreadyExists?: boolean }>;
  handleConnected: (wallet: CircleWallet, token: string, encKey: string) => void;
  refreshBalance: () => Promise<void>;
}

export function useCircleWallet(): CircleWalletState {
  const sdkRef = useRef<W3SSdk | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<"signin" | "signup">("signin");
  const [wallet, setWallet] = useState<CircleWallet | null>(null);
  const [userToken, setUserToken] = useState<string | null>(null);
  const [encryptionKey, setEncryptionKey] = useState<string | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Restore session from sessionStorage on mount
  useEffect(() => {
    try {
      const token   = sessionStorage.getItem(SESSION.userToken);
      const encKey  = sessionStorage.getItem(SESSION.encryptionKey);
      const walletJ = sessionStorage.getItem(SESSION.wallet);
      if (token && encKey && walletJ) {
        setUserToken(token);
        setEncryptionKey(encKey);
        setWallet(JSON.parse(walletJ) as CircleWallet);
      }
    } catch { /* ignore */ }
  }, []);

  // Init SDK
  useEffect(() => {
    const init = async () => {
      try {
        const sdk = new W3SSdk({ appSettings: { appId: APP_ID } });
        sdkRef.current = sdk;
        await sdk.getDeviceId(); // required — establishes iframe session
        setSdkReady(true);
      } catch {
        console.error("W3SSdk init failed");
      }
    };
    void init();
  }, []);

  const refreshBalance = useCallback(async () => {
    if (!userToken || !wallet) return;
    try {
      const balances = await getTokenBalance(userToken, wallet.id);
      const usdc = balances.find(
        (b) => b.token.symbol.startsWith("USDC") || b.token.name.includes("USDC")
      );
      setUsdcBalance(usdc?.amount ?? "0");
    } catch {
      // ignore
    }
  }, [userToken, wallet]);

  useEffect(() => {
    if (wallet && userToken) void refreshBalance();
  }, [wallet, userToken, refreshBalance]);

  const executeChallenge = useCallback(
    (challengeId: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        const sdk = sdkRef.current;
        if (!sdk || !sdkReady) {
          reject(new Error("Circle SDK is still initializing — wait a moment and try again"));
          return;
        }
        if (!userToken || !encryptionKey) {
          reject(new Error("Session expired — please sign in again"));
          return;
        }
        if (!challengeId) {
          reject(new Error("No challenge returned — check your USDC balance and try again"));
          return;
        }
        sdk.setAuthentication({ userToken, encryptionKey });
        sdk.execute(challengeId, (error, result) => {
          if (error) {
            reject(new Error((error as Error).message ?? "Challenge failed"));
            return;
          }
          console.log("Challenge result:", result);
          resolve();
        });
      });
    },
    [userToken, encryptionKey, sdkReady]
  );

  const handleCreateUser = useCallback(async (uid: string) => {
    const data = await createUser(uid);
    setUserId(uid);
    if (data.code && data.code !== 155106) return { error: data.message ?? "Create user failed" };
    return {};
  }, []);

  const handleGetToken = useCallback(async (uid: string) => {
    const data = await getUserToken(uid);
    if (!data.userToken) return { error: "Failed to get token" };
    setUserToken(data.userToken);
    setEncryptionKey(data.encryptionKey);
    return { userToken: data.userToken, encryptionKey: data.encryptionKey };
  }, []);

  const handleInitialize = useCallback(async (token: string) => {
    const data = await initializeUser(token);
    if (data.code === 155106) {
      // User already initialized — load their wallet
      const wallets = await listWallets(token);
      const arc = wallets.find((w) => w.blockchain === "ARC-TESTNET") ?? wallets[0];
      if (arc) {
        setWallet(arc);
        setShowModal(false);
        return { alreadyExists: true };
      }
    }
    if (!data.challengeId) return { error: "Failed to initialize" };
    return { challengeId: data.challengeId };
  }, []);

  const handleConnected = useCallback(
    (w: CircleWallet, token: string, encKey: string) => {
      setWallet(w);
      setUserToken(token);
      setEncryptionKey(encKey);
      setShowModal(false);
      sessionStorage.setItem(SESSION.userToken,     token);
      sessionStorage.setItem(SESSION.encryptionKey, encKey);
      sessionStorage.setItem(SESSION.wallet,        JSON.stringify(w));
    },
    []
  );

  const disconnect = useCallback(() => {
    setWallet(null);
    setUserToken(null);
    setEncryptionKey(null);
    setUsdcBalance(null);
    setUserId(null);
    sessionStorage.removeItem(SESSION.userToken);
    sessionStorage.removeItem(SESSION.encryptionKey);
    sessionStorage.removeItem(SESSION.wallet);
  }, []);

  return {
    sdkRef,
    sdkReady,
    isConnected: !!wallet,
    wallet,
    userToken,
    encryptionKey,
    usdcBalance,
    userId,
    showModal,
    modalMode,
    openModal: (mode: "signin" | "signup" = "signin") => { setModalMode(mode); setShowModal(true); },
    closeModal: () => setShowModal(false),
    disconnect,
    executeChallenge,
    handleCreateUser,
    handleGetToken,
    handleInitialize,
    handleConnected,
    refreshBalance,
  };
}
