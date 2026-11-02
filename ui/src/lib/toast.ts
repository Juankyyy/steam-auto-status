import { Toast as ToastPrimitive } from '@base-ui/react/toast'

/** Global toast manager, so non-component code can queue toasts. */
export const toast = ToastPrimitive.createToastManager()
