const infrastructureControllers = new WeakSet<Function>();

/**
 * Marks SDK-owned transport endpoints that are authenticated by their own
 * infrastructure protocol rather than an application business capability.
 * This module is intentionally not part of the public package exports.
 */
export function OpenXiangdaInfrastructureController(): ClassDecorator {
  return target => {
    infrastructureControllers.add(target);
  };
}

export function isOpenXiangdaInfrastructureController(
  target: Function
): boolean {
  return infrastructureControllers.has(target);
}
