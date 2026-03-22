# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Run the app:
   `npm run dev`

## Sales RPC Mode

The POS sale flow supports a rollout flag:

- `VITE_SALES_RPC_MODE=compat` (default): use `rpc_create_sale` and fallback to `process_sale_atomic` during transition.
- `VITE_SALES_RPC_MODE=auto`: fallback only if `rpc_create_sale` is missing.
- `VITE_SALES_RPC_MODE=canonical`: use only `rpc_create_sale`.
