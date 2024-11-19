// ============ External Imports ============
import { ethers, BigNumber, ContractReceipt } from "ethers";

// ============ Internal Imports ============
import { extractErrorMessage } from "../utils";
import { TransactionOptions } from "../types";

// ============ Config Imports ============
import orderbookAbi from "../../abi/OrderBook.json";

export abstract class OrderCanceler {
    /**
     * @dev Cancels multiple orders by their IDs.
     * @param providerOrSigner - The ethers.js provider or signer to interact with the blockchain.
     * @param orderbookAddress - The address of the order book contract.
     * @param orderIds - An array of order IDs to be cancelled.
     * @param txOptions - Transaction options to be used for the transaction.
     * @returns A promise that resolves when the transaction is confirmed.
     */
    static async cancelOrders(
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
        orderbookAddress: string,
        orderIds: BigNumber[],
        txOptions?: TransactionOptions
    ): Promise<ContractReceipt> {
        console.time('Total Cancel Orders Time');
        try {
            const orderbook = new ethers.Contract(orderbookAddress, orderbookAbi.abi, providerOrSigner);
            
            console.time('Get Signer Time');
            const signer = providerOrSigner instanceof ethers.Signer
                ? providerOrSigner
                : providerOrSigner.getSigner();
            const address = await signer.getAddress();
            console.timeEnd('Get Signer Time');

            const data = orderbook.interface.encodeFunctionData("batchCancelOrders", [orderIds]);

            const tx: ethers.providers.TransactionRequest = {
                to: orderbook.address,
                from: address,
                data,
                ...(txOptions?.nonce !== undefined && { nonce: txOptions.nonce }),
                ...(txOptions?.gasLimit && { gasLimit: txOptions.gasLimit }),
                ...(txOptions?.gasPrice && { gasPrice: txOptions.gasPrice }),
                ...(txOptions?.maxFeePerGas && { maxFeePerGas: txOptions.maxFeePerGas }),
                ...(txOptions?.maxPriorityFeePerGas && { maxPriorityFeePerGas: txOptions.maxPriorityFeePerGas })
            };

            console.time('RPC Calls Time');
            const [gasLimit, baseGasPrice] = await Promise.all([
                !tx.gasLimit ? signer.estimateGas({
                    ...tx,
                    gasPrice: ethers.utils.parseUnits('1', 'gwei')
                }) : Promise.resolve(tx.gasLimit),
                (!tx.gasPrice && !tx.maxFeePerGas) ? signer.provider!.getGasPrice() : Promise.resolve(undefined)
            ]);
            console.timeEnd('RPC Calls Time');

            if (!tx.gasLimit) {
                tx.gasLimit = gasLimit;
            }

            if (!tx.gasPrice && !tx.maxFeePerGas && baseGasPrice) {
                if (txOptions?.priorityFee) {
                    const priorityFeeWei = ethers.utils.parseUnits(
                        txOptions.priorityFee.toString(),
                        'gwei'
                    );
                    tx.gasPrice = baseGasPrice.add(priorityFeeWei);
                } else {
                    tx.gasPrice = baseGasPrice;
                }
            }

            console.time('Transaction Send Time');
            const transaction = await signer.sendTransaction(tx);
            console.timeEnd('Transaction Send Time');

            console.time('Transaction Wait Time');
            const receipt = await transaction.wait(1);
            console.timeEnd('Transaction Wait Time');

            console.timeEnd('Total Cancel Orders Time');
            return receipt;
        } catch (e: any) {
            console.timeEnd('Total Cancel Orders Time');
            console.log({ e });
            if (!e.error) {
                throw e;
            }
            throw extractErrorMessage(e);
        }
    }

    static async estimateGas(
        providerOrSigner: ethers.providers.JsonRpcProvider | ethers.Signer,
        orderbookAddress: string,
        orderIds: BigNumber[]
    ): Promise<BigNumber> {
        try {
            const orderbook = new ethers.Contract(orderbookAddress, orderbookAbi.abi, providerOrSigner);

            const gasEstimate = await orderbook.estimateGas.batchCancelOrders(orderIds);
            return gasEstimate;
        } catch (e: any) {
            if (!e.error) {
                throw e;
            }
            throw extractErrorMessage(e);
        }
    }
}
