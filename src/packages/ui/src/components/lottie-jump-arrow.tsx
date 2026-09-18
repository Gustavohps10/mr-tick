'use client'

import React from 'react'

import { cn } from '@/lib/utils'

export interface LottieJumpArrowProps extends React.ComponentPropsWithoutRef<'svg'> {
  direction?: 'down' | 'up'
  animating?: boolean
  size?: number
}

export function LottieJumpArrow({
  direction = 'down',
  animating = false,
  className,
  size,
  width,
  height,
  style,
  ...svgProps
}: LottieJumpArrowProps) {
  const isUp = direction === 'up'
  const finalWidth = width ?? size ?? 8
  const finalHeight = height ?? size ?? 14

  return (
    <svg
      fill="none"
      width={finalWidth}
      height={finalHeight}
      viewBox="204 190 84 174"
      className={cn(
        'shrink-0 transition-colors',
        isUp && 'rotate-180',
        className,
      )}
      aria-hidden="true"
      style={{
        width: finalWidth,
        height: finalHeight,
        ...style,
      }}
      {...svgProps}
    >
      <g id="i0">
        <g transform="translate(247.5,316)">
          {animating && (
            <animateTransform
              repeatCount="indefinite"
              type="translate"
              attributeName="transform"
              dur="0.96s"
              begin="0s"
              calcMode="spline"
              values="247.5 316; 247.125 354.988; 247.125 354.988; 247.5 304; 247.5 304; 247.5 316; 247.5 316"
              keyTimes="0; 0.25; 0.375; 0.75; 0.916667; 0.958333; 1"
              keySplines="0.865 0 0.087 1; 0 0 1 1; 0.167 0 0 0.944; 0 0 1 1; 0.78 0 0.48 1; 0 0 1 1"
              fill="freeze"
            />
          )}
          <g transform="scale(1,1)">
            {animating && (
              <animateTransform
                repeatCount="indefinite"
                type="scale"
                attributeName="transform"
                dur="0.96s"
                begin="0s"
                calcMode="spline"
                values="1 1; 0.9 1.1; 1.05 0.9; 1.05 0.9; 1 1; 1 1"
                keyTimes="0; 0.25; 0.375; 0.625; 0.75; 1"
                keySplines="0 0 1 1; 0.167 0.076 0.833 0.944; 0 0 1 1; 0.183 0 0.921 1; 0 0 1 1"
                fill="freeze"
              />
            )}
            <g transform="translate(-121.547,-258.364)">
              <g id="i1" transform="matrix(1,0,0,0.999,0,-5)">
                <path
                  strokeLinecap="round"
                  strokeWidth="18"
                  stroke="currentColor"
                  d="M120.5,155.5C120.5,155.5,121.5,257.5,121.5,257.5"
                />
              </g>
              <g id="i2" transform="matrix(1.003,0,0,1,0.564,0.66)">
                <path
                  strokeLinecap="round"
                  strokeWidth="18"
                  stroke="currentColor"
                  d="M87.562,228.5C87.562,228.5,120.624,257.562,120.624,257.562C120.624,257.562,152.562,228.505,152.562,228.505"
                />
              </g>
            </g>
          </g>
        </g>
      </g>
    </svg>
  )
}
