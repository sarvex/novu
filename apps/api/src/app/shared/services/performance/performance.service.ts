import { monitorEventLoopDelay, performance, PerformanceEntry, PerformanceObserver } from 'perf_hooks';
import { Logger } from '@nestjs/common';

import { ApiException } from '../../exceptions/api.exception';

const LOG_CONTEXT = 'Performance';
const CONTEXT_EVENT_LOOP_DELAY = 'PerformanceEventLoopDelay';
const CONTEXT_EVENT_LOOP_UTILIZATION = 'PerformanceEventLoopUtilization';
const CONTEXT_GARBAGE_COLLECTION = 'PerformanceGarbageCollection';
const CONTEXT_MARK = 'PerformanceMark';
const CONTEXT_MEASURE = 'PerformanceMeasure';

enum MarkFunctionNameEnum {
  CREATE_NOTIFICATION_JOBS = 'createNotificationJobs',
  DIGEST_FILTER_STEPS = 'digestFilterSteps',
  TRIGGER_EVENT = 'triggerEvent',
}

enum MarkTypeEnum {
  END = 'end',
  START = 'start',
}

interface IMark {
  id: string;
}

interface IMeasure {
  name: string;
  duration: number;
}

let marks: string[] = [];
let measures: IMeasure[] = [];

function perfObserver(list, observer) {
  list.getEntries().forEach((entry) => {
    if (entry.entryType === 'mark') {
      marks.push(`[${entry.name}]`);
      marks.push(`startTime: ${entry.startTime}`);
    }

    if (entry.entryType === 'measure') {
      measures.push({ name: entry.name, duration: entry.duration });
    }
  });
}

const performanceObserver = new PerformanceObserver(perfObserver);

export class PerformanceService {
  private monitorEventLoopDelay;
  private utilization;

  constructor() {
    this.monitorEventLoopDelay = monitorEventLoopDelay({ resolution: 20 });
    this.start();
  }

  private start() {
    this.monitorEventLoopDelay.enable();
    this.utilization = performance.eventLoopUtilization();
    this.track();
  }

  private buildMark(markId: string, markType: MarkTypeEnum): string {
    return `${markType}:${markId}`;
  }

  private buildMarkStart(mark: IMark): string {
    return this.buildMark(this.getMarkId(mark), MarkTypeEnum.START);
  }

  private buildMarkEnd(mark: IMark): string {
    return this.buildMark(this.getMarkId(mark), MarkTypeEnum.END);
  }

  private getMarkId(mark: IMark): string {
    return mark.id;
  }

  public setStart(mark: IMark): void {
    performance.mark(this.buildMarkStart(mark));
    performance.eventLoopUtilization();
  }

  public setEnd(mark: IMark): void {
    performance.mark(this.buildMarkEnd(mark));
    performance.eventLoopUtilization();
    this.store(mark);
  }

  private store(mark: IMark): void {
    performance.measure(this.getMarkId(mark), this.buildMarkStart(mark), this.buildMarkEnd(mark));
  }

  public clear(): void {
    performanceObserver.disconnect();
    marks = [];
    measures = [];
  }

  private publishMonitorEventLoopDelayStats(): void {
    this.monitorEventLoopDelay.disable();

    const { min, max, mean, stddev, percentiles } = this.monitorEventLoopDelay;

    const p50 = percentiles.get(50);
    const p75 = percentiles.get(75);
    const p99 = percentiles.get(99);

    Logger.debug('EVENT LOOP DELAY STATS', CONTEXT_EVENT_LOOP_DELAY);
    Logger.debug(
      `Min: ${min} | Max: ${max} | Mean: ${mean} | StdDev: ${stddev} | P50: ${p50} | P75: ${p75} | P99: ${p99}`,
      CONTEXT_EVENT_LOOP_DELAY
    );
  }

  private publishEventLoopUtilization(): void {
    const { idle, active, utilization } = performance.eventLoopUtilization(this.utilization);

    Logger.debug('EVENT LOOP UTILIZATION', CONTEXT_EVENT_LOOP_UTILIZATION);
    Logger.debug(`Idle: ${idle} | Active: ${active} | Utilization: ${utilization}`, CONTEXT_EVENT_LOOP_UTILIZATION);
  }

  private publishMarks(): void {
    marks.map((mark) => Logger.debug(mark, CONTEXT_MARK));
  }

  private calculateAverage(markFunctionName: MarkFunctionNameEnum, durations: number[]): void {
    const sum = durations.reduce((a, b) => a + b, 0);
    const average = Number(sum) / Number(durations.length);

    Logger.debug(
      `${markFunctionName} | Average: ${average.toFixed(2)} ms from a total of ${durations.length}`,
      CONTEXT_MEASURE
    );
  }

  private publishMeasures(allLogs: boolean): void {
    const createNotificationJobsMeasures: number[] = [];
    const digestFilterStepsMeasures: number[] = [];
    const triggerEventMeasures: number[] = [];

    measures.map((measure) => {
      if (measure.name.includes(MarkFunctionNameEnum.CREATE_NOTIFICATION_JOBS)) {
        createNotificationJobsMeasures.push(measure.duration);
      }

      if (measure.name.includes(MarkFunctionNameEnum.DIGEST_FILTER_STEPS)) {
        digestFilterStepsMeasures.push(measure.duration);
      }

      if (measure.name.includes(MarkFunctionNameEnum.TRIGGER_EVENT)) {
        triggerEventMeasures.push(measure.duration);
      }

      if (allLogs) {
        Logger.debug(`Duration: ${measure.duration.toFixed(2)} ms| Id: ${measure.name}`, CONTEXT_MEASURE);
      }
    });

    this.calculateAverage(MarkFunctionNameEnum.CREATE_NOTIFICATION_JOBS, createNotificationJobsMeasures);
    this.calculateAverage(MarkFunctionNameEnum.DIGEST_FILTER_STEPS, digestFilterStepsMeasures);
    this.calculateAverage(MarkFunctionNameEnum.TRIGGER_EVENT, triggerEventMeasures);
  }

  public publishResults(): void {
    this.publishMeasures(false);
    this.publishMonitorEventLoopDelayStats();
    this.publishEventLoopUtilization();
    this.clear();
    this.start();
  }

  public track(): void {
    performanceObserver.observe({ entryTypes: ['measure', 'mark'] });
  }

  public buildDigestStepsMark(
    transactionId: string,
    templateId: string,
    notificationId: string,
    subscriberId: string
  ): IMark {
    return {
      id: `${MarkFunctionNameEnum.DIGEST_FILTER_STEPS}:event:${transactionId}:template:${templateId}:notification:${notificationId}:subscriber:${subscriberId}:steps`,
    };
  }

  public buildEventMark(notificationTemplateId: string, transactionId: string): IMark {
    return {
      id: `${MarkFunctionNameEnum.TRIGGER_EVENT}:notificationTemplate:${notificationTemplateId}:event:${transactionId}`,
    };
  }

  public buildNotificationMark(notificationTemplateId: string, transactionId: string, subscriberId: string): IMark {
    return {
      id: `${MarkFunctionNameEnum.CREATE_NOTIFICATION_JOBS}:notificationTemplate:${notificationTemplateId}:event:${transactionId}:subscriber:${subscriberId}`,
    };
  }
}
