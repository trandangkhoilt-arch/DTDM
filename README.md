# TaskFlow

Ứng dụng quản lý công việc cá nhân dùng React, Cloudflare Workers và D1. Chatbot dùng Cloudflare Workers AI khi deployed và Ollama cục bộ khi chạy development.

## Chạy local

Yêu cầu Node.js/npm và Ollama đang chạy:

```sh
npm install
ollama pull qwen2.5:3b
cp .dev.vars.example .dev.vars
npm run db:migrate
npm run dev
```

Mở URL Vite hiển thị trong terminal, tạo tài khoản và chọn **TaskFlow AI** ở menu bên trái. Ví dụ `.dev.vars` đặt `AI_MODE=ollama`, khi đó local Worker gọi `http://127.0.0.1:11434` với model `qwen2.5:3b`, không phát sinh inference Workers AI. Có thể cấu hình `OLLAMA_BASE_URL` và `OLLAMA_MODEL` trong `.dev.vars`.

Chatbot chỉ truy vấn công việc thuộc tài khoản đang đăng nhập. Đề xuất tạo/sửa công việc và checklist không được ghi vào D1 khi chat; người dùng phải bấm **Xác nhận và lưu**. Endpoint xác nhận kiểm tra quyền sở hữu, trường dữ liệu và category trước khi thực hiện.

## Kiểm tra

```sh
npm run typecheck
npm run build
npm run test
```

## Workers AI production

Wrangler cấu hình binding `AI` cho Cloudflare Workers AI và model mặc định `@cf/openai/gpt-oss-20b`. Ollama không được gọi trên production; Worker không thể truy cập Ollama `localhost` trên máy cá nhân.

Workers AI có allocation miễn phí 10.000 Neurons/ngày theo trang [pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/). Trên Workers Paid, mức dùng vượt allocation được tính theo giá công bố; kiểm tra usage trong Cloudflare Dashboard. Model gpt-oss-20b có giá riêng theo token trên trang model. Thay đổi `AI_MODEL` qua biến môi trường Worker nếu muốn dùng model khác.

Chatbot chỉ truy vấn công việc thuộc tài khoản đang đăng nhập. Đề xuất tạo/sửa công việc và checklist không được ghi vào D1 khi chat; người dùng phải bấm **Xác nhận và lưu**. Endpoint xác nhận kiểm tra quyền sở hữu, trường dữ liệu và category trước khi thực hiện. Dữ liệu hội thoại và task context được gửi tới Cloudflare Workers AI để suy luận.

## Cloudflare

Tạo D1, cấu hình binding `DB` và áp dụng migrations trước khi deploy. `npm run deploy` build và deploy Worker, Static Assets, D1 binding và AI binding lên Cloudflare.
