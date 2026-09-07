import { Module } from '@nestjs/common';
import {
  eventHandlerManifest,
  eventSchemas,
  eventSubscriptionCodes,
} from '@app/contracts';
import {
  OpenXiangdaModule,
  eventSigningSecretsFromEnvironment,
} from 'openxiangda/nest';

@Module({
  imports: [
    OpenXiangdaModule.forApplication({
      eventHandlerManifest,
      eventSchemas,
      eventSigningSecrets: eventSigningSecretsFromEnvironment(
        eventSubscriptionCodes
      ),
    }),
  ],
})
export class AppModule {}
