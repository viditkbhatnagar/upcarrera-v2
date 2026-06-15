import { SetMetadata } from '@nestjs/common';

export const RESPONSE_MESSAGE = 'response_message';

/** Overrides the `message` field of the standard {status,message,data} envelope. */
export const ResponseMessage = (message: string) => SetMetadata(RESPONSE_MESSAGE, message);
