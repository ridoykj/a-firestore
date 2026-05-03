import axios, { type AxiosInstance } from "axios";

const createAxiosInstance = (baseUrl?: string): AxiosInstance => {
  const axiosInstance = baseUrl ? axios.create({
    baseURL: baseUrl,
  }) : axios.create();

  // 🟢 Attach token to every request dynamically
  axiosInstance.interceptors.request.use(
    (config) => {  
      return config;
    },
    (error) => Promise.reject(error)
  );

  // 🔁 Response interceptor: Handle 401 and retry request after refreshing token
  axiosInstance.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config;

      // Prevent infinite retry loop
      if (error.response?.status === 401 && !originalRequest._retry) {
        originalRequest._retry = true;

        try {
          // Attempt to refresh token
          const auth = sessionStorage.getItem('auth-token');
          const refreshToken = auth ? JSON.parse(auth).refreshToken : null;

          if (!refreshToken) {
            // Optionally redirect to login
            return Promise.reject(error);
          }

          const { data } = await axios.post(`${baseUrl}/auth/refresh-token`, {
            refreshToken,
          });

          // Save new access token to sessionStorage
          const updatedAuth = { auth, accessToken: data.accessToken };
          sessionStorage.setItem('auth-token', JSON.stringify(updatedAuth));

          // 🟢 Manually update the Authorization header for this retry
          originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;

          // Retry the original request with the new token
          return axiosInstance(originalRequest);
        } catch (refreshError) {
          // Token refresh failed, force logout or redirect
          sessionStorage.removeItem('auth-token');
          return Promise.reject(refreshError);
        }
      }

      return Promise.reject(error);
    }
  );

  return axiosInstance;
};

export default createAxiosInstance;
