/**
 * LessonWorkspaceSkeleton — the loading state for the lesson workspace.
 * Mirrors the three columns so the layout does not jump when content arrives.
 */

import React from 'react'
import { Skeleton } from '../ui/Skeleton'

export function LessonWorkspaceSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading lesson</span>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="hidden flex-col gap-3 lg:flex lg:w-[208px] xl:w-[248px]">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-10 w-full" />
          {[0, 1, 2, 3, 4, 5, 6].map((row) => (
            <Skeleton key={row} className="h-6 w-full" />
          ))}
        </div>

        <div className="min-w-0 flex-1 space-y-6">
          <div className="space-y-3">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-3 w-52" />
          </div>
          <Skeleton className="h-24 w-full max-w-[68ch]" />
          <div className="max-w-[68ch] space-y-3">
            {[0, 1, 2, 3, 4].map((row) => (
              <Skeleton key={row} className="h-4 w-full" />
            ))}
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>

        <div className="hidden flex-col gap-3 lg:flex lg:w-[248px] xl:w-[288px]">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-16 w-full" />
          {[0, 1, 2, 3].map((row) => (
            <Skeleton key={row} className="h-8 w-full" />
          ))}
        </div>
      </div>
    </div>
  )
}

export default LessonWorkspaceSkeleton
