import * as StellarSDK from "stellar-sdk"
import logger from "../config/loggingConfig";
import { env } from "./env";

// configure
const server = new StellarSDK.Horizon.Server("https://api.testnet.minepi.com");
  const NETWORK_PASSPHRASE = "Pi Testnet";

// prepare keypairs
const issuerKeypair = StellarSDK.Keypair.fromSecret(env.WALLET_PRIVATE_SEED); // use actual secret key here
const distributorKeypair = StellarSDK.Keypair.fromSecret("SAHL7KSCAA37HAYWO5AMZ5PZ2VQCENVGSIXCDJJN65URIUAP5QO7W3BR"); // use actual secret key here
logger.info(`Issuer Public Key: ${issuerKeypair.publicKey()}`);
logger.info(`Distributor Public Key: ${distributorKeypair.publicKey()}`);

async function main() {

  // define a token
  // token code should be alphanumeric and up to 12 characters, case sensitive
  const customToken = new StellarSDK.Asset("Prophub", issuerKeypair.publicKey());

  const distributorAccount = await server.loadAccount(distributorKeypair.publicKey());

  // look up base fee
  const response = await server.ledgers().order("desc").limit(1).call();
  const latestBlock = response.records[0];
  const baseFee = latestBlock.base_fee_in_stroops;

  // prepare a transaction that establishes trustline
  const trustlineTransaction = new StellarSDK.TransactionBuilder(distributorAccount, {
    fee: baseFee.toString(),
    networkPassphrase: NETWORK_PASSPHRASE,
    timebounds: await server.fetchTimebounds(90),
  })
    .addOperation(StellarSDK.Operation.changeTrust({ asset: customToken, limit: "100000000" }))
    .build();

  trustlineTransaction.sign(distributorKeypair);

  // submit a tx
  await server.submitTransaction(trustlineTransaction);
  logger.info("Trustline created successfully");

  //====================================================================================
  // now mint MapCap by sending from issuer account to distributor account

  const issuerAccount = await server.loadAccount(issuerKeypair.publicKey());

  // checking new balance of the distributor account
  // distributorAccount.balances.forEach((balance) => {
  //   if (balance.asset_type === "native") {
  //     logger.info(`Test-Pi Balance: ${balance.balance}`);
  //   } else if (balance.asset_type === "credit_alphanum4" || balance.asset_type === "credit_alphanum12") {
  //     logger.info(`${balance.asset_code} Balance: ${balance.balance}`);
  //   }
  // });

  const paymentTransaction = new StellarSDK.TransactionBuilder(issuerAccount, {
    fee: baseFee.toString(),
    networkPassphrase: NETWORK_PASSPHRASE,
    timebounds: await server.fetchTimebounds(90),
  })
    .addOperation(
      StellarSDK.Operation.payment({
        destination: distributorKeypair.publicKey(),
        asset: customToken,
        amount: "1000000", // amount to mint
      })
    )
    .build();

  paymentTransaction.sign(issuerKeypair);

  // submit a tx
  await server.submitTransaction(paymentTransaction);
  logger.info("Token issued successfully");

  // checking new balance of the distributor account
  const updatedDistributorAccount = await server.loadAccount(distributorKeypair.publicKey());
  updatedDistributorAccount.balances.forEach((balance) => {
    if (balance.asset_type === "native") {
      logger.info(`Test-Pi Balance: ${balance.balance}`);
    } else if (balance.asset_type === "credit_alphanum4" || balance.asset_type === "credit_alphanum12") {
      logger.info(`${balance.asset_code} Balance: ${balance.balance}`);
    }
  });
}

async function setDomain() {
  const issuerAccount = await server.loadAccount(issuerKeypair.publicKey());

  // look up base fee
  const response = await server.ledgers().order("desc").limit(1).call();
  const latestBlock = response.records[0];
  const baseFee = latestBlock.base_fee_in_stroops;

  const setOptionsTransaction = new StellarSDK.TransactionBuilder(issuerAccount, {
    fee: baseFee.toString(),
    networkPassphrase: NETWORK_PASSPHRASE,
    timebounds: await server.fetchTimebounds(90),
  })
    .addOperation(StellarSDK.Operation.setOptions({ homeDomain: "proptriz-test.netlify.app" })) // replace with your actual domain
    .build();

  setOptionsTransaction.sign(issuerKeypair);

  await server.submitTransaction(setOptionsTransaction);
  console.log("Home Domain is set successfully.");
}

// main().catch((err) => {
//   logger.error("Error:", err);
//   if (err.response) {
//     console.log("Horizon error:", err.response.data);
//     console.log("Result Codes:", err.response.data.extras?.result_codes);
//   }
//   process.exit(1);
// });

setDomain().catch((err) => {
  logger.error("Error:", err);
  if (err.response) {
    console.log("Horizon error:", err.response.data);
    console.log("Result Codes:", err.response.data.extras?.result_codes);
  }
  process.exit(1);
});