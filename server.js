import 'dotenv/config';  // Load environment variables
import express from 'express';
import { Buffer } from 'buffer'; // Decode base64 wallet secret
import fs from 'fs'; // (Not used yet but imported for potential future file operations)
import { Keypair } from '@solana/web3.js'; // For Solana keypair handling

// Import Metaplex UMI and mpl-core tools
import {
  keypairIdentity,
  generateSigner,
  publicKey,
  createSignerFromKeypair,
} from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import {
  mplCore,
  create,
  fetchCollectionV1,
  CheckResult,
} from '@metaplex-foundation/mpl-core';

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware to parse incoming JSON requests
app.use(express.json());

// Load key environment variables
const ORACLE_ADDRESS = publicKey(process.env.ORACLE_ADDRESS);
const RPC_ENDPOINT = process.env.RPC_ENDPOINT;
const COLLECTION_ADDRESS = process.env.COLLECTION_ADDRESS;
const METADATA_URI = process.env.METADATA_URI;

// ---------------- Minting Logic ----------------
async function mintSoulboundNFT(wallet, itemName) {
  // Load and decode the minting wallet secret key from environment
  const base64 = process.env.WALLET_SECRET_BASE64;
  if (!base64) throw new Error('Missing WALLET_SECRET_BASE64 in .env');

  const secretKey = Uint8Array.from(JSON.parse(Buffer.from(base64, 'base64').toString('utf-8')));

  // Initialize UMI client and plugins
  const umi = createUmi(RPC_ENDPOINT).use(mplCore());

  // Generate a signer identity from the decoded secret key
  const umiKeypair = umi.eddsa.createKeypairFromSecretKey(secretKey);
  const signer = createSignerFromKeypair(umi, umiKeypair);
  umi.use(keypairIdentity(signer)); // Use the signer to authenticate transactions

  // Prepare minting details
  const userWallet = publicKey(wallet); // Customer wallet
  const parentCollection = publicKey(COLLECTION_ADDRESS); // NFT collection address
  const assetSigner = generateSigner(umi); // New signer for the minted asset

  const collection = await fetchCollectionV1(umi, parentCollection);


  //  Small logic for correct name and URI for the NFT
  let nftName = '';
  let nftUri = '';

  if (itemName.startsWith(NAME_KING_BONK)) {
    nftName = process.env.NAME_KING_BONK;
    nftUri = process.env.URI_KING_BONK;
  } else if (itemName.startsWith(NAME_THE_BONK)) {
    nftName = process.env.NAME_THE_BONK;
    nftUri = process.env.URI_THE_BONK;
  } else if (itemName.startsWith(NAME_MONKE)) {
    nftName = process.env.NAME_MONKE;
    nftUri = process.env.URI_MONKE;
  } else {
    throw new Error('Unknown itemName provided.');
  }

  // Create and mint the NFT
  await create(umi, {
    name: nftName,
    asset: assetSigner,
    collection,
    uri: nftUri,
    owner: userWallet,
    plugins: [
      {
        type: 'Oracle',
        resultsOffset: { type: 'Anchor' },
        baseAddress: ORACLE_ADDRESS,
        lifecycleChecks: {
          transfer: [CheckResult.CAN_REJECT],
        },
      },
    ],
  }).sendAndConfirm(umi);

  // Return the minted NFT public key
  return assetSigner.publicKey.toString();
}

// ---------------- Endpoint ----------------
app.post('/mint', async (req, res) => {
  // Authenticate request using API secret
  const clientSecret = req.headers['x-api-secret'];
  if (!clientSecret || clientSecret !== process.env.MINT_API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing API secret.' });
  }

  const { wallet, itemName } = req.body;

  // Validate request body fields
  if (!wallet || !itemName) {
    return res.status(400).json({ error: 'Missing wallet or itemName in request body.' });
  }

  // Call Minteing Logic
  try {
    const mint = await mintSoulboundNFT(wallet, itemName);
    //Return to manager
    res.status(200).json({
      success: true,
      mint,
      itemName,
      explorer: `https://explorer.solana.com/address/${mint}`,
    });
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({
      success: false,
      error: `Error minting NFT: ${err.message}`
    });
  }
});

// Start the Express server
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
