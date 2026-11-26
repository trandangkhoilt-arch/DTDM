import { createContext, useCallback, useContext, useEffect, useRef, useState, Fragment, type ReactNode } from 'react'
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Toaster, toast } from 'sonner'
import { AssistantReply } from './AssistantReply'
import { BarChart3, Bell, Bot, Repeat2, Check, CheckCircle2, ClipboardList, FolderKanban, LayoutDashboard, LogOut, Menu, MessageSquareText, Plus, Search, Send, Settings, Sparkles, Trash2, UserRound, X } from 'lucide-react'

type User = { id:string; name:string; email:string; created_at:string }
type Task = { id:string; title:string; description?:string; status:'TODO'|'IN_PROGRESS'|'DONE'; priority:'LOW'|'MEDIUM'|'HIGH'; due_at?:string; category_id?:string; category_name?:string; category_color?:string; subtasks?:Subtask[] }
type Subtask = { id:string; title:string; is_done:number }
type Category = { id:string; name:string; color:string; task_count:number }

async function api(path:string, options:RequestInit={}) {
  const res=await fetch(path,{...options,credentials:'include',headers:{'Content-Type':'application/json',...options.headers}})
  let data:any=null
  try{data=await res.json()}catch{}
  if(!res.ok)throw new Error(data?.error||'Không thể kết nối máy chủ')
  return data
}

const AuthContext=createContext<{
  user:User|null
  loading:boolean
  refresh:()=>Promise<void>
  setSessionUser:(user:User|null)=>void
  logout:()=>Promise<void>
}>({user:null,loading:true,refresh:async()=>{},setSessionUser:()=>{},logout:async()=>{}})

function AuthProvider({children}:{children:ReactNode}) {
  const [user,setUser]=useState<User|null>(null),[loading,setLoading]=useState(true)
  const revision=useRef(0)
  const setSessionUser=(next:User|null)=>{
    revision.current++
    setUser(next)
    setLoading(false)
  }
  const refresh=useCallback(async()=>{
    const current=++revision.current
    try{
      const result=await api('/api/auth/me',{cache:'no-store'})
      if(revision.current===current)setUser(result.user)
    }catch{
      if(revision.current===current)setUser(null)
    }finally{
      if(revision.current===current)setLoading(false)
    }
  },[])
  const logout=async()=>{
    await api('/api/auth/logout',{method:'POST'})
    setSessionUser(null)
  }
  useEffect(()=>{void refresh()},[refresh])
  return <AuthContext.Provider value={{user,loading,refresh,setSessionUser,logout}}>{children}</AuthContext.Provider>
}
const useAuth=()=>useContext(AuthContext)

function Logo({compact=false}:{compact?:boolean}){return <div className="logo"><span className="logo-mark"><Check size={15}/></span>{!compact&&<span>TaskFlow</span>}</div>}

function Landing(){
  return <div className="landing"><header className="landing-nav"><Logo/><nav><a href="#features">Tính năng</a><a href="#steps">Cách hoạt động</a><a href="#about">Về dự án</a></nav><div><Link className="btn ghost" to="/login">Đăng nhập</Link><Link className="btn" to="/register">Bắt đầu miễn phí</Link></div></header><main>
    <section className="hero-section"><div className="hero-copy"><span className="eyebrow">TASKFLOW · QUẢN LÝ CÔNG VIỆC</span><h1>Biến kế hoạch thành <em>kết quả</em></h1><p>Sắp xếp công việc, theo dõi tiến độ và hoàn thành mục tiêu của bạn — gọn gàng trên mọi thiết bị.</p><div className="hero-actions"><Link className="btn lg" to="/register">Bắt đầu ngay</Link><a className="btn ghost lg" href="#features">Xem tính năng</a></div></div><div className="hero-visual"><div className="demo-window"><div className="demo-top"><span/><span/><span/></div><div className="demo-body"><aside><i/><i/><i/></aside><div><strong>Xin chào, Minh!</strong><div className="demo-kpis"><b><small>Tổng số</small>12</b><b><small>Đang làm</small>4</b><b><small>Hoàn thành</small>7</b></div><div className="demo-chart"><span/><span/><span/><span/><span/><span/></div></div></div></div><div className="float-card"><CheckCircle2/><div><b>Đúng tiến độ</b><small>75% tuần này</small></div></div></div></section>
    <section className="benefits" id="features"><article><span className="benefit-icon"><ClipboardList/></span><h3>Tất cả công việc ở một nơi</h3><p>Quản lý danh mục, hạn và trạng thái trong một không gian riêng tư.</p></article><article><span className="benefit-icon"><Bell/></span><h3>Biết việc nào cần ưu tiên</h3><p>Dễ dàng nhìn ra công việc quan trọng và sắp đến hạn.</p></article><article><span className="benefit-icon"><BarChart3/></span><h3>Theo dõi tiến độ rõ ràng</h3><p>Số liệu cập nhật trực tiếp từ dữ liệu công việc của bạn.</p></article></section>
    <section className="steps" id="steps"><span className="eyebrow">QUY TRÌNH ĐƠN GIẢN</span><h2>Hoàn thành mọi mục tiêu</h2><div className="step-grid"><article><b>01</b><h3>Tạo công việc</h3><p>Ghi lại việc cần làm, danh mục và thời hạn.</p></article><article><b>02</b><h3>Cập nhật trạng thái</h3><p>Chuyển công việc qua từng giai đoạn thực hiện.</p></article><article><b>03</b><h3>Xem kết quả</h3><p>Theo dõi thống kê hoàn thành trên Dashboard.</p></article></div></section>
  </main><footer id="about"><Logo/><span>TaskFlow · Mini-project triển khai trên Cloudflare</span></footer></div>
}

function AuthPage({mode}:{mode:'login'|'register'}){
  const {user,setSessionUser}=useAuth(),nav=useNavigate()
  const [name,setName]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[show,setShow]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const submit=async(e:any)=>{e.preventDefault();setError('');if(mode==='register'&&password!==confirm)return setError('Mật khẩu xác nhận không khớp');setBusy(true);try{const result=await api(`/api/auth/${mode}`,{method:'POST',body:JSON.stringify(mode==='register'?{name,email,password}:{email,password})});setSessionUser(result.user);toast.success(mode==='register'?'Tạo tài khoản thành công':'Đăng nhập thành công');nav('/dashboard',{replace:true})}catch(err:any){setError(err.message)}finally{setBusy(false)}}
  return <div className="auth-page"><Link to="/" className="auth-logo"><Logo/></Link><form className="auth-card" onSubmit={submit}><span className="eyebrow">{mode==='login'?'CHÀO MỪNG TRỞ LẠI':'BẮT ĐẦU NGAY'}</span><h1>{mode==='login'?(user?'Chuyển tài khoản':'Đăng nhập vào TaskFlow'):'Tạo tài khoản mới'}</h1><p>{mode==='login'?'Tiếp tục quản lý công việc của bạn':'Bắt đầu hành trình hoàn thành mục tiêu'}</p>{mode==='register'&&<label>Họ và tên<input value={name} onChange={e=>setName(e.target.value)} required/></label>}<label>Email<input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required/></label><label>Mật khẩu<div className="password"><input type={show?'text':'password'} autoComplete={mode==='login'?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)} required/><button type="button" onClick={()=>setShow(!show)}>{show?'Ẩn':'Hiện'}</button></div></label>{mode==='register'&&<label>Xác nhận mật khẩu<input type={show?'text':'password'} value={confirm} onChange={e=>setConfirm(e.target.value)} required/></label>}<label className="check-label"><input type="checkbox" checked={show} onChange={()=>setShow(!show)} /> Hiển thị mật khẩu</label>{error&&<div className="form-error">{error}</div>}<button className="btn full" disabled={busy}>{busy?'Đang xử lý...':mode==='login'?'Đăng nhập':'Tạo tài khoản'}</button><div className="auth-switch">{mode==='login'?<>Chưa có tài khoản? <Link to="/register">Đăng ký</Link></>:<>Đã có tài khoản? <Link to="/login">Đăng nhập</Link></>}</div></form></div>
}

function Protected({children}:{children:ReactNode}){const {user,loading}=useAuth();if(loading)return <div className="loading-page"><span className="spinner"/></div>;if(!user)return <Navigate to="/login" replace/>;return <Fragment key={user.id}>{children}</Fragment>}

function AppShell({children}:{children:ReactNode}){const {user,logout}=useAuth(),nav=useNavigate(),[open,setOpen]=useState(false);const signOut=async()=>{try{await logout();nav('/login',{replace:true})}catch(err:any){toast.error(err.message)}};return <div className="app-shell"><aside className={`sidebar ${open?'open':''}`}><Logo/><button className="mobile-close" onClick={()=>setOpen(false)}><X/></button><nav>{[['/dashboard','Tổng quan',LayoutDashboard],['/tasks','Công việc của tôi',ClipboardList],['/assistant','TaskFlow AI',Bot],['/categories','Danh mục',FolderKanban],['/profile','Hồ sơ',UserRound]].map(([p,l,I]:any)=><NavLink key={p} to={p} onClick={()=>setOpen(false)}><I/><span>{l}</span></NavLink>)}</nav><div className="sidebar-bottom"><NavLink to="/profile"><Settings/><span>Cài đặt</span></NavLink><NavLink to="/login"><Repeat2/><span>Chuyển tài khoản</span></NavLink><button onClick={signOut}><LogOut/><span>Đăng xuất</span></button></div></aside>{open&&<button className="drawer-backdrop" onClick={()=>setOpen(false)} aria-label="Đóng menu"/>}<div className="app-main"><header className="topbar"><button className="menu-button" onClick={()=>setOpen(true)}><Menu/></button><div className="top-search"><Search/><input aria-label="Tìm kiếm công việc" placeholder="Tìm kiếm công việc..." onKeyDown={e=>{if(e.key==='Enter')nav('/tasks?search='+encodeURIComponent((e.target as HTMLInputElement).value))}}/></div><button className="btn compact" onClick={()=>nav('/tasks?new=1')}><Plus/><span>Công việc</span></button><Bell className="bell"/><div className="avatar">{user?.name?.[0]?.toUpperCase()}</div></header><main className="content">{children}</main></div></div>}

function Dashboard(){
  const {user}=useAuth(),nav=useNavigate()
  const [data,setData]=useState<any>(null),[error,setError]=useState('')
  useEffect(()=>{api('/api/dashboard').then(setData).catch(e=>setError(e.message))},[])
  const stats=data?.stats
  return <><div className="page-heading"><div><span className="date-label">{new Intl.DateTimeFormat('vi-VN',{weekday:'long',day:'numeric',month:'long'}).format(new Date())}</span><h1>Xin chào, {user?.name}!</h1><p>Cùng hoàn thành những việc quan trọng nhé.</p></div><button className="btn" onClick={()=>nav('/tasks?new=1')}><Plus/> Tạo công việc</button></div>{error&&<div className="error-box">{error}<button onClick={()=>location.reload()}>Thử lại</button></div>}<div className="kpi-grid">{[['Tổng số',stats?.total??0,'#EEF2FF'],['Chưa thực hiện',stats?.todo??0,'#F1F5F9'],['Đang thực hiện',stats?.in_progress??0,'#EEF2FF'],['Hoàn thành',stats?.done??0,'#DCFCE7'],['Quá hạn',stats?.overdue??0,'#FEE2E2']].map(([l,v,c])=><article className="kpi-card" key={l as string} style={{borderTopColor:c as string}}><span>{l}</span><strong>{v as number}</strong></article>)}</div><div className="dashboard-grid"><section className="panel"><div className="panel-heading"><h2>Trạng thái công việc</h2><span>{stats?.completion??0}% hoàn thành</span></div><div className="progress-ring" style={{'--progress':`${stats?.completion??0}%`} as any}><div><strong>{stats?.completion??0}%</strong><small>Hoàn thành</small></div></div><div className="legend"><span><i className="todo"/>Chưa làm <b>{stats?.todo??0}</b></span><span><i className="doing"/>Đang làm <b>{stats?.in_progress??0}</b></span><span><i className="done"/>Hoàn thành <b>{stats?.done??0}</b></span></div></section><section className="panel"><div className="panel-heading"><h2>Sắp đến hạn</h2><Link to="/tasks?preset=week">Xem tất cả</Link></div><DeadlineList items={data?.upcoming}/></section><section className="panel wide"><div className="panel-heading"><h2>Ưu tiên cao chưa xong</h2><Link to="/tasks?priority=HIGH">Xem tất cả</Link></div><DeadlineList items={data?.high}/></section></div></>
}

function DeadlineList({items}:{items?:Task[]}){if(!items?.length)return <div className="empty-mini">Không có công việc trong danh sách</div>;return <div className="deadline-list">{items.map(t=><Link className="deadline-row" to={`/tasks/${t.id}`} key={t.id}><span className={`status-dot ${t.status.toLowerCase()}`}/><div><b>{t.title}</b><small>{t.category_name||'Chưa phân loại'} · {t.due_at?new Date(t.due_at).toLocaleDateString('vi-VN'):'Không có hạn'}</small></div><span className={`priority ${t.priority.toLowerCase()}`}>{t.priority==='HIGH'?'Cao':t.priority==='MEDIUM'?'Trung bình':'Thấp'}</span></Link>)}</div>}

function TaskModal({task,close,onSaved}:{task?:Task|null;close:()=>void;onSaved:()=>void}){
  const [categories,setCategories]=useState<Category[]>([])
  const [title,setTitle]=useState(task?.title||''),[description,setDescription]=useState(task?.description||''),[status,setStatus]=useState(task?.status||'TODO'),[priority,setPriority]=useState(task?.priority||'MEDIUM'),[category,setCategory]=useState(task?.category_id||''),[due,setDue]=useState(task?.due_at?task.due_at.slice(0,16):''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  useEffect(()=>{api('/api/categories').then(d=>setCategories(d.categories)).catch(()=>{})},[])
  useEffect(()=>{const f=(e:KeyboardEvent)=>{if(e.key==='Escape')close()};window.addEventListener('keydown',f);return()=>window.removeEventListener('keydown',f)},[close])
  const submit=async(e:any)=>{e.preventDefault();setError('');if(title.trim().length<1||title.trim().length>150)return setError('Tên công việc phải từ 1–150 ký tự');setBusy(true);try{await api(task?`/api/tasks/${task.id}`:'/api/tasks',{method:task?'PATCH':'POST',body:JSON.stringify({title:title.trim(),description,status,priority,category_id:category||null,due_at:due?new Date(due).toISOString():null})});toast.success(task?'Đã cập nhật công việc':'Đã tạo công việc');onSaved();close()}catch(err:any){setError(err.message)}finally{setBusy(false)}}
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><form className="modal" onSubmit={submit}><div className="modal-head"><div><span className="eyebrow">THÔNG TIN CÔNG VIỆC</span><h2>{task?'Chỉnh sửa công việc':'Thêm công việc mới'}</h2></div><button type="button" onClick={close}><X/></button></div><div className="modal-body"><label>Tên công việc *<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={150} placeholder="Ví dụ: Hoàn thành báo cáo Cloudflare"/></label><label>Mô tả<textarea value={description} onChange={e=>setDescription(e.target.value)} maxLength={5000} rows={4}/></label><div className="form-grid"><label>Danh mục<select value={category} onChange={e=>setCategory(e.target.value)}><option value="">Chưa phân loại</option>{categories.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label><label>Trạng thái<select value={status} onChange={e=>setStatus(e.target.value as any)}><option value="TODO">Chưa thực hiện</option><option value="IN_PROGRESS">Đang thực hiện</option><option value="DONE">Hoàn thành</option></select></label><label>Ưu tiên<select value={priority} onChange={e=>setPriority(e.target.value as any)}><option value="LOW">Thấp</option><option value="MEDIUM">Trung bình</option><option value="HIGH">Cao</option></select></label><label>Ngày đến hạn<input type="datetime-local" value={due} onChange={e=>setDue(e.target.value)}/>{due&&new Date(due)<new Date()&&<small className="past-warning">Ngày này đã qua</small>}</label></div>{error&&<div className="form-error">{error}</div>}</div><div className="modal-actions"><button type="button" className="btn ghost" onClick={close}>Hủy</button><button className="btn" disabled={busy}>{busy?'Đang lưu...':'Lưu công việc'}</button></div></form></div>
}

function Tasks(){
  const [params,setParams]=useSearchParams(),[tasks,setTasks]=useState<Task[]>([]),[categories,setCategories]=useState<Category[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[modal,setModal]=useState<Task|null|false>(false),[confirm,setConfirm]=useState<string|null>(null)
  const nav=useNavigate()
  const load=async()=>{setLoading(true);setError('');try{const qs=params.toString();const [td,cd]=await Promise.all([api('/api/tasks'+(qs?'?'+qs:'')),api('/api/categories')]);setTasks(td.tasks);setCategories(cd.categories)}catch(e:any){setError(e.message)}finally{setLoading(false)}}
  useEffect(()=>{load()},[params])
  useEffect(()=>{if(params.get('new')==='1')setModal(null);const n=(e:KeyboardEvent)=>{if(e.key.toLowerCase()==='n'&&!['INPUT','TEXTAREA','SELECT'].includes((e.target as HTMLElement).tagName))setModal(null)};window.addEventListener('keydown',n);return()=>window.removeEventListener('keydown',n)},[])
  const setFilter=(k:string,v:string)=>{const p=new URLSearchParams(params);v?p.set(k,v):p.delete(k);setParams(p)}
  const remove=async(id:string)=>{try{await api('/api/tasks/'+id,{method:'DELETE'});toast.success('Đã xóa công việc');setConfirm(null);load()}catch(e:any){toast.error(e.message)}}
  return <><div className="page-heading"><div><h1>Công việc của tôi</h1><p>Quản lý và theo dõi danh sách công việc.</p></div><button className="btn" onClick={()=>setModal(null)}><Plus/> Thêm công việc</button></div><div className="filters"><div className="status-tabs">{[['','Tất cả'],['TODO','Chưa thực hiện'],['IN_PROGRESS','Đang thực hiện'],['DONE','Hoàn thành']].map(([v,l])=><button className={params.get('status')===v?'active':''} onClick={()=>setFilter('status',v)} key={v}>{l}</button>)}</div><div className="filter-row"><div className="inline-search"><Search/><input value={params.get('search')||''} onChange={e=>setFilter('search',e.target.value)} placeholder="Tìm theo tên hoặc mô tả"/></div><select value={params.get('category')||''} onChange={e=>setFilter('category',e.target.value)}><option value="">Tất cả danh mục</option>{categories.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select><select value={params.get('priority')||''} onChange={e=>setFilter('priority',e.target.value)}><option value="">Mọi ưu tiên</option><option value="LOW">Thấp</option><option value="MEDIUM">Trung bình</option><option value="HIGH">Cao</option></select><select value={params.get('sort')||''} onChange={e=>setFilter('sort',e.target.value)}><option value="">Mới tạo</option><option value="due">Hạn gần nhất</option><option value="priority">Độ ưu tiên</option></select><button className="clear-btn" onClick={()=>setParams({})}>Xóa bộ lọc</button></div></div>{error?<div className="error-box">{error}<button onClick={load}>Thử lại</button></div>:loading?<div className="task-list">{[1,2,3].map(i=><div className="task-skeleton" key={i}/>)}</div>:tasks.length?<div className="task-list">{tasks.map(t=><article className="task-row" key={t.id} onClick={()=>nav('/tasks/'+t.id)}><button className={`task-check ${t.status==='DONE'?'done':''}`} onClick={e=>{e.stopPropagation();api('/api/tasks/'+t.id,{method:'PATCH',body:JSON.stringify({status:t.status==='DONE'?'TODO':'DONE'})}).then(load)}}>{t.status==='DONE'&&<Check/>}</button><div className="task-main"><h3>{t.title}</h3><p>{t.description||'Không có mô tả'}</p><div className="task-meta"><span style={{color:t.category_color}}>{t.category_name||'Chưa phân loại'}</span>{t.due_at&&<span className={new Date(t.due_at)<new Date()&&t.status!=='DONE'?'overdue':''}>Hạn {new Date(t.due_at).toLocaleDateString('vi-VN')}</span>}</div></div><span className={`priority ${t.priority.toLowerCase()}`}>{t.priority==='HIGH'?'Cao':t.priority==='MEDIUM'?'Trung bình':'Thấp'}</span><div className="task-actions" onClick={e=>e.stopPropagation()}><button onClick={()=>setModal(t)}>Sửa</button><button onClick={()=>setConfirm(t.id)} aria-label="Xóa"><Trash2/></button></div></article>)}</div>:<div className="empty-state"><span><ClipboardList/></span><h2>Chưa có công việc</h2><p>Tạo công việc đầu tiên để bắt đầu theo dõi tiến độ.</p><button className="btn" onClick={()=>setModal(null)}>Tạo công việc đầu tiên</button></div>} {modal!==false&&<TaskModal task={modal||undefined} close={()=>{setModal(false);if(params.get('new')){params.delete('new');setParams(params)}}} onSaved={load}/>} {confirm&&<div className="modal-backdrop"><div className="confirm-modal"><Trash2/><h2>Xóa công việc?</h2><p>Thao tác không thể hoàn tác.</p><div><button className="btn ghost" onClick={()=>setConfirm(null)}>Hủy</button><button className="btn danger" onClick={()=>remove(confirm)}>Xóa công việc</button></div></div></div>}</>
}

function TaskDetail(){
  const {id}=useParams(),nav=useNavigate()
  const [task,setTask]=useState<Task|null>(null),[sub,setSub]=useState(''),[error,setError]=useState('')
  const load=()=>api('/api/tasks/'+id).then(d=>setTask(d.task)).catch(e=>setError(e.message))
  useEffect(()=>{load()},[id])
  const patchStatus=async(status:string)=>{await api('/api/tasks/'+id,{method:'PATCH',body:JSON.stringify({status})});load()}
  const addSub=async(e:any)=>{e.preventDefault();if(!sub.trim())return;await api('/api/tasks/'+id+'/subtasks',{method:'POST',body:JSON.stringify({title:sub.trim()})});setSub('');load()}
  if(error)return <div className="error-box">{error}<button onClick={()=>nav('/tasks')}>Quay lại</button></div>
  if(!task)return <div className="task-skeleton"/>
  const done=task.subtasks?.filter(s=>s.is_done).length||0,total=task.subtasks?.length||0
  return <><button className="back-link" onClick={()=>nav('/tasks')}>← Công việc của tôi</button><div className="detail-grid"><section className="detail-main"><span className={`priority ${task.priority.toLowerCase()}`}>{task.priority==='HIGH'?'Ưu tiên cao':task.priority==='MEDIUM'?'Ưu tiên trung bình':'Ưu tiên thấp'}</span><h1>{task.title}</h1><p className="detail-description">{task.description||'Không có mô tả.'}</p><div className="subtask-panel"><div className="panel-heading"><h2>Công việc con</h2>{total>0&&<span>{done}/{total} hoàn thành</span>}</div>{total>0&&<div className="progress-bar"><span style={{width:`${done/total*100}%`}}/></div>}<div className="subtask-list">{task.subtasks?.map(s=><label key={s.id}><input type="checkbox" checked={!!s.is_done} onChange={()=>api('/api/subtasks/'+s.id,{method:'PATCH',body:JSON.stringify({is_done:!s.is_done})}).then(load)}/><span className={s.is_done?'completed':''}>{s.title}</span><button onClick={()=>api('/api/subtasks/'+s.id,{method:'DELETE'}).then(load)}><Trash2/></button></label>)}</div><form className="subtask-form" onSubmit={addSub}><input value={sub} onChange={e=>setSub(e.target.value)} placeholder="Thêm công việc con..."/><button className="btn compact">Thêm</button></form></div></section><aside className="detail-side"><h3>Trạng thái</h3><select value={task.status} onChange={e=>patchStatus(e.target.value)}><option value="TODO">Chưa thực hiện</option><option value="IN_PROGRESS">Đang thực hiện</option><option value="DONE">Hoàn thành</option></select><dl><div><dt>Danh mục</dt><dd>{task.category_name||'Chưa phân loại'}</dd></div><div><dt>Ngày đến hạn</dt><dd>{task.due_at?new Date(task.due_at).toLocaleString('vi-VN'):'Không có'}</dd></div></dl></aside></div></>
}

function Categories(){
  const [items,setItems]=useState<Category[]>([]),[name,setName]=useState(''),[color,setColor]=useState('#6366F1'),[editing,setEditing]=useState<Category|null>(null),[error,setError]=useState('')
  const load=()=>api('/api/categories').then(d=>setItems(d.categories)).catch(e=>setError(e.message))
  useEffect(()=>{load()},[])
  const submit=async(e:any)=>{e.preventDefault();try{await api(editing?'/api/categories/'+editing.id:'/api/categories',{method:editing?'PATCH':'POST',body:JSON.stringify({name,color})});setName('');setEditing(null);load()}catch(e:any){setError(e.message)}}
  const remove=async(c:Category)=>{if(!confirm(`Xóa danh mục "${c.name}"? Công việc sẽ chuyển sang Chưa phân loại.`))return;await api('/api/categories/'+c.id,{method:'DELETE'});load()}
  return <><div className="page-heading"><div><h1>Danh mục</h1><p>Nhóm công việc theo mục đích của bạn.</p></div></div>{error&&<div className="error-box">{error}</div>}<div className="category-layout"><section className="category-grid">{items.map(c=><article className="category-card" key={c.id}><div className="category-icon" style={{background:c.color}}><FolderKanban/></div><div><h3>{c.name}</h3><p>{c.task_count} công việc</p></div><div className="category-actions"><button onClick={()=>{setEditing(c);setName(c.name);setColor(c.color)}}>Sửa</button><button onClick={()=>remove(c)}><Trash2/></button></div></article>)}</section><form className="category-form" onSubmit={submit}><h2>{editing?'Sửa danh mục':'Thêm danh mục'}</h2><label>Tên danh mục<input value={name} onChange={e=>setName(e.target.value)} maxLength={40} required/></label><label>Màu sắc<input type="color" value={color} onChange={e=>setColor(e.target.value)}/></label><button className="btn full">{editing?'Lưu thay đổi':'Thêm danh mục'}</button>{editing&&<button type="button" className="btn ghost full" onClick={()=>{setEditing(null);setName('')}}>Hủy</button>}</form></div></>
}

function Profile(){
  const {user,refresh,logout}=useAuth(),nav=useNavigate(),[name,setName]=useState(user?.name||''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  useEffect(()=>setName(user?.name||''),[user])
  const save=async(e:any)=>{e.preventDefault();setBusy(true);setError('');try{await api('/api/profile',{method:'PATCH',body:JSON.stringify({name})});await refresh();toast.success('Đã cập nhật hồ sơ')}catch(e:any){setError(e.message)}finally{setBusy(false)}}
  const signOut=async()=>{try{await logout();nav('/login',{replace:true})}catch(err:any){toast.error(err.message)}}
  return <><div className="page-heading"><div><h1>Hồ sơ cá nhân</h1><p>Thông tin tài khoản và tùy chỉnh.</p></div></div><section className="profile-card"><div className="profile-avatar">{user?.name?.[0]?.toUpperCase()}</div><div className="profile-info"><h2>{user?.name}</h2><p>{user?.email}</p><small>Thành viên từ {user?.created_at?new Date(user.created_at).toLocaleDateString('vi-VN'):''}</small></div></section><form className="profile-form" onSubmit={save}><h2>Thông tin hiển thị</h2><label>Tên hiển thị<input value={name} onChange={e=>setName(e.target.value)} minLength={2} maxLength={80}/></label><label>Email<input value={user?.email||''} disabled/></label>{error&&<div className="form-error">{error}</div>}<button className="btn" disabled={busy}>Lưu thay đổi</button></form><button className="btn ghost logout-profile" onClick={signOut}><LogOut/> Đăng xuất</button></>
}

type AssistantAction = {
  type:'create_task'|'update_task'
  task_id?:string
  title:string
  previous_title?:string
  description?:string
  priority?:'LOW'|'MEDIUM'|'HIGH'
  status?:'TODO'|'IN_PROGRESS'|'DONE'
  due_at?:string|null
  category_name?:string|null
  subtasks?:string[]
}
type ChatMessage = {id:string;role:'user'|'assistant';content:string;actions?:AssistantAction[];proposal_status?:'pending'|'confirmed'|'dismissed'|null}
type AssistantConversation = {id:string;title:string;updated_at:string;message_count:number}

function assistantActionDetails(action:AssistantAction){
  if(action.type==='create_task')return [
    action.description?`Mô tả: ${action.description}`:'Chưa có mô tả',
    action.category_name?`Danh mục: ${action.category_name}`:null,
    action.due_at?`Hạn: ${new Date(action.due_at).toLocaleString('vi-VN')}`:'Chưa đặt hạn',
  ].filter(Boolean) as string[]
  return [
    `Công việc: ${action.previous_title||action.title}`,
    action.title!==action.previous_title?`Tên mới: ${action.title}`:null,
    action.description!==undefined?`Mô tả mới: ${action.description||'Xóa mô tả'}`:null,
    action.status?`Trạng thái mới: ${action.status==='TODO'?'Chưa thực hiện':action.status==='IN_PROGRESS'?'Đang thực hiện':'Hoàn thành'}`:null,
    action.due_at!==undefined?`Hạn mới: ${action.due_at?new Date(action.due_at).toLocaleString('vi-VN'):'Xóa hạn'}`:null,
    action.category_name!==undefined?`Danh mục mới: ${action.category_name||'Chưa phân loại'}`:null,
  ].filter(Boolean) as string[]
}

function AssistantPage(){
  const {user}=useAuth()
  const [messages,setMessages]=useState<ChatMessage[]>([{id:'welcome',role:'assistant',content:`Xin chào ${user?.name||'bạn'}! Mình có thể tra cứu công việc, lập kế hoạch hoặc chia nhỏ nhiệm vụ. Mọi thay đổi sẽ cần bạn xác nhận trước khi lưu.`}])
  const [conversations,setConversations]=useState<AssistantConversation[]>([])
  const [conversationId,setConversationId]=useState<string|null>(null)
  const [pendingMessageId,setPendingMessageId]=useState<string|null>(null)
  const [historyLoading,setHistoryLoading]=useState(true)
  const [input,setInput]=useState('')
  const [pending,setPending]=useState<AssistantAction[]>([])
  const [busy,setBusy]=useState(false)
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  const [modelLabel,setModelLabel]=useState(import.meta.env.DEV?'Ollama · qwen2.5:3b':'Workers AI · gpt-oss-20b')
  const selectionKey = `taskflow:assistant:conversation:${user?.id}`
  const selectConversation=useCallback((id:string|null)=>{
    setConversationId(id)
    try{
      if(id)localStorage.setItem(selectionKey,id)
      else localStorage.removeItem(selectionKey)
    }catch{}
  },[selectionKey])
  const restoreMessages=(saved:ChatMessage[])=>{
    setMessages(saved)
    const proposal=saved.findLast(item=>item.proposal_status==='pending'&&item.actions?.length)
    setPending(proposal?.actions||[])
    setPendingMessageId(proposal?.id||null)
  }
  useEffect(()=>{
    let active=true
    const load=async()=>{
      try{
        const result=await api('/api/assistant/conversations')
        if(!active)return
        const history:AssistantConversation[]=result.conversations
        setConversations(history)
        let remembered:string|null=null
        try{remembered=localStorage.getItem(selectionKey)}catch{}
        const selected=history.find(item=>item.id===remembered)||history[0]
        if(selected){
          const saved=await api(`/api/assistant/conversations/${selected.id}/messages`)
          if(!active)return
          selectConversation(selected.id)
          restoreMessages(saved.messages)
        }
      }catch(err:any){if(active)setError(err.message)}
      finally{if(active)setHistoryLoading(false)}
    }
    void load()
    return()=>{active=false}
  },[selectionKey,selectConversation])
  const blocked=historyLoading||busy||saving
  const openConversation=async(id:string)=>{
    if(blocked)return
    setBusy(true);setError('')
    try{
      const result=await api(`/api/assistant/conversations/${id}/messages`)
      selectConversation(id)
      restoreMessages(result.messages)
      setInput('')
    }catch(err:any){setError(err.message)}
    finally{setBusy(false)}
  }
  const startConversation=()=>{
    selectConversation(null);setPending([]);setPendingMessageId(null);setError('');setInput('')
    setMessages([{id:'welcome',role:'assistant',content:`Xin chào ${user?.name||'bạn'}! Mình có thể tra cứu công việc, lập kế hoạch hoặc chia nhỏ nhiệm vụ. Mọi thay đổi sẽ cần bạn xác nhận trước khi lưu.`}])
  }
  const sendMessage=async(text:string)=>{
    const message=text.trim()
    if(!message||blocked)return
    setBusy(true);setError('')
    let id=conversationId
    const temporaryId=crypto.randomUUID()
    try{
      if(!id){
        const {conversation}=await api('/api/assistant/conversations',{method:'POST',body:JSON.stringify({title:message})})
        id=conversation.id as string
        selectConversation(id)
        setConversations(items=>[{...conversation,message_count:0},...items])
      }
      setMessages(items=>[...items.filter(item=>item.id!=='welcome'),{id:temporaryId,role:'user',content:message}])
      setInput('')
      const result=await api('/api/assistant/chat',{method:'POST',body:JSON.stringify({message,conversation_id:id})})
      setModelLabel(result.provider==='workers-ai'?`Workers AI · ${String(result.model).split('/').at(-1)}`:`Ollama · ${result.model}`)
      const actions:AssistantAction[]=result.actions||[]
      setMessages(items=>[
        ...items.map(item=>item.id===temporaryId
          ? {...item,id:result.user_message_id}
          : actions.length&&item.proposal_status==='pending' ? {...item,proposal_status:'dismissed' as const} : item),
        {id:result.assistant_message_id,role:'assistant',content:result.reply,actions,proposal_status:actions.length?'pending':null},
      ])
      if(actions.length){
        setPending(actions)
        setPendingMessageId(result.assistant_message_id)
      }
    }catch(err:any){
      setError(err instanceof TypeError&&/fetch|load failed/i.test(err.message)
        ?'Không thể kết nối máy chủ TaskFlow. Hãy kiểm tra ứng dụng đang chạy rồi thử lại.'
        :err.message)
      if(id){
        try{
          const saved=await api(`/api/assistant/conversations/${id}/messages`)
          restoreMessages(saved.messages)
        }catch{}
      }
    }finally{
      if(id){
        try{
          const result=await api('/api/assistant/conversations')
          setConversations(result.conversations)
        }catch{}
      }
      setBusy(false)
    }
  }
  const confirmActions=async()=>{
    if(!pending.length||!pendingMessageId||blocked)return
    setSaving(true);setError('')
    try{
      const result=await api('/api/assistant/actions',{method:'POST',body:JSON.stringify({confirmed:true,actions:pending,assistant_message_id:pendingMessageId})})
      const count=result.saved?.length||pending.length
      setPending([])
      setPendingMessageId(null)
      setMessages(items=>items.map(item=>item.id===pendingMessageId?{...item,proposal_status:'confirmed'}:item))
      toast.success(`Đã lưu ${count} đề xuất`)
    }catch(err:any){setError(err.message)}
    finally{setSaving(false)}
  }
  const dismissProposal=async()=>{
    if(!conversationId||!pendingMessageId||blocked)return
    setSaving(true);setError('')
    try{
      await api(`/api/assistant/conversations/${conversationId}/messages/${pendingMessageId}`,{method:'PATCH',body:JSON.stringify({proposal_status:'dismissed'})})
      setMessages(items=>items.map(item=>item.id===pendingMessageId?{...item,proposal_status:'dismissed'}:item))
      setPending([])
      setPendingMessageId(null)
    }catch(err:any){setError(err.message)}
    finally{setSaving(false)}
  }
  const examples=['Tóm tắt công việc sắp đến hạn của tôi','Lập kế hoạch ôn thi trong 7 ngày','Chia nhỏ công việc báo cáo Cloudflare']
  return <section className="assistant-page">
    <header className="assistant-heading"><div className="assistant-heading-icon"><Sparkles/></div><div><span className="eyebrow">TASKFLOW AI ASSISTANT</span><h1>Trợ lý công việc của bạn</h1><p>AI hỗ trợ lập kế hoạch · dữ liệu riêng trong TaskFlow</p></div><span className="assistant-model"><i/> {modelLabel}</span></header>
    <div className="assistant-disclaimer"><Bot size={17}/><span>AI chỉ đọc công việc thuộc tài khoản của bạn. Mọi đề xuất tạo hoặc sửa chỉ được ghi vào D1 sau khi bạn xác nhận.</span></div>
    <div className="assistant-layout"><aside className="assistant-history"><button className="assistant-new-chat" onClick={startConversation} disabled={blocked}><Plus size={16}/> Cuộc trò chuyện mới</button><span className="assistant-history-label">LỊCH SỬ TRÒ CHUYỆN</span>{historyLoading?<div className="assistant-history-empty">Đang tải…</div>:conversations.length?conversations.map(item=><button key={item.id} className={`assistant-history-item ${conversationId===item.id?'active':''}`} onClick={()=>openConversation(item.id)} disabled={blocked}><MessageSquareText size={16}/><span><b>{item.title}</b><small>{new Date(item.updated_at).toLocaleString('vi-VN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})} · {item.message_count} tin nhắn</small></span></button>):<div className="assistant-history-empty">Các cuộc trò chuyện của bạn sẽ hiển thị ở đây.</div>}</aside><div className="assistant-chat">
      <div className="assistant-messages" aria-live="polite">{messages.map(item=><div className={`chat-message ${item.role}`} key={item.id}><span className="chat-avatar">{item.role==='assistant'?<Sparkles size={16}/>:user?.name?.[0]?.toUpperCase()}</span><div className="chat-bubble"><span className="chat-sender">{item.role==='assistant'?'TaskFlow AI':'Bạn'}</span>{item.role==='assistant'?<AssistantReply content={item.content}/>:<p>{item.content}</p>}{item.actions?.length?<div className="chat-proposal-history"><span className={`proposal-history-status ${item.proposal_status||'pending'}`}>{item.proposal_status==='confirmed'?'Đã xác nhận và lưu':item.proposal_status==='dismissed'?'Đã hủy':'Đề xuất chờ xác nhận'}</span>{item.actions.map((action,index)=><div key={`${action.title}-${index}`}><b>{action.title}</b>{action.subtasks?.length?<ul>{action.subtasks.map((subtask,subIndex)=><li key={`${subtask}-${subIndex}`}>{subtask}</li>)}</ul>:null}</div>)}</div>:null}</div></div>)}{busy&&<div className="chat-message assistant"><span className="chat-avatar"><Sparkles size={16}/></span><div className="chat-bubble"><span className="chat-sender">TaskFlow AI</span><p className="typing-indicator"><i/><i/><i/> Đang suy nghĩ…</p></div></div>}</div>
      {!pending.length&&messages.length===1&&<div className="assistant-suggestions">{examples.map(text=><button key={text} disabled={blocked} onClick={()=>sendMessage(text)}>{text}<span>→</span></button>)}</div>}
      {!!pending.length&&<section className="proposal-card"><div className="proposal-heading"><div><Sparkles size={18}/><div><b>Đề xuất chờ xác nhận</b><small>{pending.length} thay đổi · chưa được lưu</small></div></div><button className="proposal-dismiss" onClick={dismissProposal} disabled={blocked} aria-label="Hủy đề xuất"><X size={18}/></button></div><div className="proposal-list">{pending.map((action,index)=><article className="proposal-item" key={`${action.type}-${action.task_id||index}-${index}`}><span className={`proposal-kind ${action.type}`}>{action.type==='create_task'?'Tạo mới':'Cập nhật'}</span><div><b>{action.type==='update_task'&&action.title!==action.previous_title?`Đổi tên: ${action.title}`:action.title}</b><small>{assistantActionDetails(action).join(' · ')}</small>{action.subtasks?.length?<ul>{action.subtasks.map((task,index)=><li key={`${task}-${index}`}>{task}</li>)}</ul>:null}</div>{action.priority&&<span className={`priority ${action.priority.toLowerCase()}`}>{action.priority==='HIGH'?'Cao':action.priority==='LOW'?'Thấp':'Trung bình'}</span>}</article>)}</div><div className="proposal-footer"><span>Chỉ bấm xác nhận nếu nội dung đúng ý bạn.</span><button className="btn" onClick={confirmActions} disabled={blocked}>{saving?'Đang lưu…':<><Check size={17}/> Xác nhận và lưu</>}</button></div></section>}
      {error&&<div className="assistant-error" role="alert">{error}<button onClick={()=>setError('')} aria-label="Đóng"><X size={16}/></button></div>}
      <form className="assistant-composer" onSubmit={event=>{event.preventDefault();void sendMessage(input)}}><textarea value={input} onChange={event=>setInput(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void sendMessage(input)}}} placeholder="Hỏi về công việc hoặc mô tả kế hoạch của bạn…" maxLength={3000} rows={2} aria-label="Tin nhắn cho TaskFlow AI"/><div><small>Enter để gửi · Shift+Enter xuống dòng</small><button className="btn" disabled={blocked||!input.trim()} aria-label="Gửi tin nhắn"><Send size={17}/><span>Gửi</span></button></div></form>
    </div></div>
  </section>
}

function NotFound(){return <div className="not-found"><span>404</span><h1>Không tìm thấy trang</h1><Link className="btn" to="/dashboard">Về Dashboard</Link></div>}

export default function App(){
  return <BrowserRouter><AuthProvider><Toaster position="top-right" richColors/><Routes><Route path="/" element={<Landing/>}/><Route path="/login" element={<AuthPage mode="login"/>}/><Route path="/register" element={<AuthPage mode="register"/>}/><Route path="/dashboard" element={<Protected><AppShell><Dashboard/></AppShell></Protected>}/><Route path="/tasks" element={<Protected><AppShell><Tasks/></AppShell></Protected>}/><Route path="/tasks/:id" element={<Protected><AppShell><TaskDetail/></AppShell></Protected>}/><Route path="/assistant" element={<Protected><AppShell><AssistantPage/></AppShell></Protected>}/><Route path="/categories" element={<Protected><AppShell><Categories/></AppShell></Protected>}/><Route path="/profile" element={<Protected><AppShell><Profile/></AppShell></Protected>}/><Route path="*" element={<NotFound/>}/></Routes></AuthProvider></BrowserRouter>
}
