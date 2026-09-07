import {
  defineApplicationContributions,
  type StandardApplicationTodoCenterProps,
  type StandardUserPageFrameProps,
  type StandardUserSurfaceContributions,
} from 'openxiangda/react';

function Frame({ children }: StandardUserPageFrameProps) {
  return <>{children}</>;
}

function Todo({ items }: StandardApplicationTodoCenterProps) {
  return <>{items.length}</>;
}

const standardUserSurfaces = {
  frame: { desktop: Frame, mobile: Frame },
  applicationTodoCenter: { desktop: Todo, mobile: Todo },
} satisfies StandardUserSurfaceContributions;

const contributions = defineApplicationContributions({}, {
  pages: {},
  standardUserSurfaces,
});

const exportedFrame = contributions.standardUserSurfaces?.frame.desktop;
void exportedFrame;
