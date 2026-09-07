import 'reflect-metadata';
import { bootstrapOpenXiangdaApplication } from 'openxiangda/nest';
import { AppModule } from './app.module.js';

await bootstrapOpenXiangdaApplication(AppModule);
