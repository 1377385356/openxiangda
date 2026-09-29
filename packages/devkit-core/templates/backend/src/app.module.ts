import { Module } from '@nestjs/common';
import {
  eventHandlerManifest,
  managedCommandHandlerManifest,
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
      managedCommandHandlerManifest,
      eventSchemas,
      eventSigningSecrets: eventSigningSecretsFromEnvironment(
        eventSubscriptionCodes
      ),
    }),
  ],
})
export class AppModule {}
