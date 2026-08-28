import { useState } from 'react'
import {
  Button,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useSidebar
} from '@morze/ui'
import type { Template } from '@shared/types'
import logoUrl from '@/assets/logo.png'
import { initials, tone } from '@/lib/accents'
import { t } from '@/lib/i18n'
import { formatLimit } from '@/lib/time'
import { templateToDraft, useStore, type NewTemplate } from '@/lib/store'
import { EmojiIcon } from './EmojiIcon'
import { PencilIcon, PlusIcon, TrashIcon } from './icons'
import { TemplateDialog } from './TemplateDialog'

export const TEMPLATE_DRAG_TYPE = 'application/x-tracker-template'

function TemplateCard({
  template,
  collapsed,
  onEdit,
  onRemove,
  onAdd
}: {
  template: Template
  collapsed: boolean
  onEdit: () => void
  onRemove: () => void
  onAdd: () => void
}): React.JSX.Element {
  const [dragging, setDragging] = useState(false)

  const card = (
    <div
      className={`tpl${dragging ? ' tpl--dragging' : ''}`}
      style={tone(template.accent)}
      draggable
      role="button"
      tabIndex={0}
      // Dragging is the fast path, but never the only one: a click appends the
      // template to the queue, which is what keyboard and touch users get.
      aria-label={t().tplAria(
        template.title,
        formatLimit(template.limitSec),
        template.overrun && template.limitSec !== null
      )}
      onClick={onAdd}
      onKeyDown={(e) => {
        // Keys on the nested edit/delete buttons bubble up here; acting on
        // them would queue the template on top of the button's own action.
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onAdd()
        }
      }}
      onDragStart={(e) => {
        e.dataTransfer.setData(TEMPLATE_DRAG_TYPE, template.id)
        e.dataTransfer.effectAllowed = 'copy'
        setDragging(true)
      }}
      onDragEnd={() => setDragging(false)}
    >
      <span className="tpl__strip" aria-hidden="true" />
      {template.icon !== null && (
        <span className="tpl__icon" aria-hidden="true">
          <EmojiIcon icon={template.icon} size={18} />
        </span>
      )}
      <span className="tpl__code" aria-hidden="true">
        {template.icon !== null ? (
          <EmojiIcon icon={template.icon} size={18} />
        ) : (
          initials(template.title)
        )}
      </span>

      <div className="tpl__body mz-sidebar-hide-collapsed">
        <div className="tpl__title">{template.title}</div>
        <div className="tpl__meta">
          {formatLimit(template.limitSec)}
          {template.overrun && template.limitSec !== null && ` · ${t().overrunShort}`}
        </div>
      </div>

      <div className="tpl__actions mz-sidebar-hide-collapsed">
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t().editTemplateAria(template.title)}
          onClick={(e) => {
            e.stopPropagation()
            onEdit()
          }}
        >
          <PencilIcon width={15} height={15} />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t().deleteTemplateAria(template.title)}
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
        >
          <TrashIcon width={15} height={15} />
        </Button>
      </div>
    </div>
  )

  if (!collapsed) return card

  return (
    <Tooltip>
      <TooltipTrigger asChild>{card}</TooltipTrigger>
      <TooltipContent side="right">
        {template.title} · {formatLimit(template.limitSec)}
      </TooltipContent>
    </Tooltip>
  )
}

export function TemplatesRail(): React.JSX.Element {
  const { state, dispatch } = useStore()
  const { state: sidebarState, isMobile } = useSidebar()
  const collapsed = sidebarState === 'collapsed' && !isMobile

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Template | null>(null)

  const addToQueue = (template: Template): void => {
    dispatch({
      type: 'queue/add',
      templateId: template.id,
      draft: templateToDraft(template)
    })
  }

  const submitEdit = (draft: NewTemplate): void => {
    if (editing) dispatch({ type: 'template/update', id: editing.id, draft })
    setEditing(null)
  }

  return (
    <Sidebar collapsible="icon" side="left" variant="sidebar">
      <SidebarHeader>
        {/* The app's brand lives here now, not in the topbar. The whole block
            hides when collapsed, so the trigger keeps the rail's centre line. */}
        <div className="rail__head mz-sidebar-hide-collapsed">
          <img className="rail__logo" src={logoUrl} alt="" width={22} height={22} />
          <b className="rail__title">Time Tracker</b>
        </div>
        <SidebarTrigger className="mz-sidebar-push" />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t().templates}</SidebarGroupLabel>
          <SidebarGroupContent>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <Button
                variant="secondary"
                className="rail__new"
                onClick={() => setCreating(true)}
                aria-label={t().createTemplate}
              >
                <PlusIcon />
                <span className="mz-sidebar-hide-collapsed">{t().newTemplate}</span>
              </Button>

              {state.templates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  collapsed={collapsed}
                  onAdd={() => addToQueue(template)}
                  onEdit={() => setEditing(template)}
                  onRemove={() => dispatch({ type: 'template/remove', id: template.id })}
                />
              ))}

              {state.templates.length === 0 && (
                <p className="empty mz-sidebar-hide-collapsed">
                  {t().railEmpty}
                </p>
              )}
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <TemplateDialog
        open={creating}
        onOpenChange={setCreating}
        title={t().newTemplateTitle}
        submitLabel={t().create}
        onSubmit={(draft) => dispatch({ type: 'template/add', draft })}
      />

      <TemplateDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={t().editTemplateTitle}
        submitLabel={t().save}
        initial={editing ? templateToDraft(editing) : undefined}
        onSubmit={submitEdit}
      />
    </Sidebar>
  )
}
