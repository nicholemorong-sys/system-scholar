"use strict";

(() => {
  const config = window.ISKOLAR_SUPABASE_CONFIG || {};
  const enabled = Boolean(config.url && config.anonKey);
  let client = null;
  let signedInProfile = null;

  function loadSupabaseSdk() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
      script.onload = () => window.supabase && window.supabase.createClient
        ? resolve()
        : reject(new Error("The Supabase client library did not load."));
      script.onerror = () => reject(new Error("Unable to load the Supabase client library."));
      document.head.append(script);
    });
  }

  function sessionRecord(user, profile) {
    return {
      role: profile.role,
      name: profile.full_name,
      studentId: profile.student_id || "",
      course: profile.course || "",
      email: profile.email || user.email || "",
      phone: profile.phone || "",
      userId: user.id
    };
  }

  async function getProfile(user) {
    const { data, error } = await client
      .from("profiles")
      .select("user_id, role, student_id, full_name, course, email, phone")
      .eq("user_id", user.id)
      .single();
    if (error) throw new Error(`Account role/profile is not provisioned: ${error.message}`);
    return data;
  }

  function applicantFolderId(studentId) {
    return `applicant-${encodeURIComponent(studentId)}`;
  }

  async function loadApplications() {
    const { data: rows, error } = await client
      .from("applications")
      .select("*, requirement_files(*)")
      .order("submitted_at", { ascending: false });
    if (error) throw new Error(`Unable to load applications: ${error.message}`);

    const state = { records: [], applicantFolders: {} };
    for (const row of rows || []) {
      const folderId = applicantFolderId(row.student_id);
      const folder = state.applicantFolders[folderId] || {
        id: folderId,
        studentId: row.student_id,
        applicant: row.applicant_name,
        files: []
      };
      const record = {
        id: row.id,
        studentId: row.student_id,
        applicantFolderId: folderId,
        student: row.applicant_name,
        course: row.course,
        email: row.email,
        phone: row.phone,
        scholarship: row.scholarship,
        status: row.status,
        submitted: row.submitted_at.slice(0, 10),
        submittedAt: row.submitted_at,
        notes: row.notes || ""
      };

      for (const file of row.requirement_files || []) {
        const { data: signed, error: signedError } = await client.storage
          .from("requirements")
          .createSignedUrl(file.object_path, 3600);
        if (signedError) throw new Error(`Unable to prepare ${file.file_name}: ${signedError.message}`);
        folder.files.push({
          applicationId: row.id,
          status: row.status,
          name: file.file_name,
          size: file.file_size,
          type: file.file_type,
          uploadedAt: file.uploaded_at,
          storagePath: file.object_path,
          signedUrl: signed.signedUrl
        });
      }

      state.records.push(record);
      state.applicantFolders[folderId] = folder;
    }

    localStorage.setItem("iskolar.applications", JSON.stringify(state));
    return state;
  }

  async function signIn(email, password, expectedRole) {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    try {
      const profile = await getProfile(data.user);
      if (profile.role !== expectedRole) {
        throw new Error(`This account is assigned to the ${profile.role} portal.`);
      }
      signedInProfile = profile;
      localStorage.setItem("iskolar.session", JSON.stringify(sessionRecord(data.user, profile)));
      await loadApplications();
      return sessionRecord(data.user, profile);
    } catch (error) {
      await client.auth.signOut();
      throw error;
    }
  }

  async function submitApplication(record, files) {
    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError || !authData.user || !signedInProfile) {
      throw new Error("Please sign in again before submitting your application.");
    }

    const { error: insertError } = await client.from("applications").insert({
      id: record.id,
      user_id: authData.user.id,
      student_id: record.studentId,
      applicant_name: record.student,
      course: record.course,
      email: record.email,
      phone: record.phone,
      scholarship: record.scholarship,
      status: record.status,
      submitted_at: record.submittedAt,
      notes: record.notes
    });
    if (insertError) throw new Error(`Unable to save application: ${insertError.message}`);

    const uploadedPaths = [];
    try {
      const fileRows = [];
      for (const file of files) {
        const fileId = window.crypto && window.crypto.randomUUID
          ? window.crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const safeName = encodeURIComponent(file.name.replace(/[\\/]/g, "_"));
        const path = `${authData.user.id}/Applicant-${record.id}/${fileId}-${safeName}`;
        const { error: uploadError } = await client.storage
          .from("requirements")
          .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
        if (uploadError) throw new Error(`Unable to upload ${file.name}: ${uploadError.message}`);
        uploadedPaths.push(path);
        fileRows.push({
          application_id: record.id,
          uploaded_by: authData.user.id,
          object_path: path,
          file_name: file.name,
          file_type: file.type || "application/octet-stream",
          file_size: file.size
        });
      }
      const { error: filesError } = await client.from("requirement_files").insert(fileRows);
      if (filesError) throw new Error(`Unable to save uploaded file records: ${filesError.message}`);
    } catch (error) {
      if (uploadedPaths.length) {
        const { error: cleanupError } = await client.storage.from("requirements").remove(uploadedPaths);
        if (cleanupError) console.error("[ISKOLAR MARSU] Uploaded files need cleanup.", cleanupError);
      }
      const { error: applicationCleanupError } = await client.from("applications").delete().eq("id", record.id);
      if (applicationCleanupError) console.error("[ISKOLAR MARSU] Incomplete application needs cleanup.", applicationCleanupError);
      throw error;
    }

    await loadApplications();
  }

  async function updateStatus(applicationId, status) {
    const { error } = await client.from("applications").update({ status }).eq("id", applicationId);
    if (error) throw new Error(`Unable to update application status: ${error.message}`);
    await loadApplications();
  }

  async function downloadUrl(file) {
    const { data, error } = await client.storage.from("requirements").createSignedUrl(file.storagePath, 60);
    if (error) throw new Error(`Unable to download ${file.name}: ${error.message}`);
    return data.signedUrl;
  }

  async function bootstrap() {
    if (!enabled) return { enabled: false };
    await loadSupabaseSdk();
    client = window.supabase.createClient(config.url, config.anonKey);
    localStorage.removeItem("iskolar.session");
    localStorage.removeItem("userRole");

    const { data, error } = await client.auth.getSession();
    if (error) throw new Error(`Unable to restore sign-in: ${error.message}`);
    if (!data.session) return { enabled: true, authenticated: false };

    const profile = await getProfile(data.session.user);
    signedInProfile = profile;
    localStorage.setItem("iskolar.session", JSON.stringify(sessionRecord(data.session.user, profile)));
    await loadApplications();
    return { enabled: true, authenticated: true };
  }

  window.iskolarBackend = {
    enabled,
    signIn,
    signOut: async () => {
      const { error } = await client.auth.signOut();
      if (error) throw new Error(`Unable to sign out: ${error.message}`);
      signedInProfile = null;
    },
    submitApplication,
    updateStatus,
    refreshApplications: loadApplications,
    downloadUrl
  };
  window.iskolarBackendReady = bootstrap();
})();
