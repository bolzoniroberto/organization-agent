'use client'
import React, { memo } from 'react'

interface OrgGroupNodeData {
  label: string
  count: number
  color: string
  bgColor: string
}

const OrgGroupNode = memo(function OrgGroupNode({ data }: { data: OrgGroupNodeData }) {
  return (
    <div
      style={{
        border: `2px solid ${data.color}`,
        borderRadius: 12,
        background: '#1e293b',
        padding: '8px 12px',
        width: '100%',
        height: '100%',
        boxSizing: 'border-box'
      }}
    >
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{data.label}</p>
      <p className="text-xs text-slate-500 mt-0.5">{data.count} nodi</p>
    </div>
  )
})

export default OrgGroupNode
