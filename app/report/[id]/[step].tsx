import { Button } from '@/components/Button';
import { ChecklistSection } from '@/components/ChecklistSection';
import { DropdownPicker } from '@/components/DropdownPicker';
import { FormField } from '@/components/FormField';
import { Icon, IconText } from '@/components/Icon';
import { LockedBadge } from '@/components/LockedBadge';
import { ProgressBar } from '@/components/ProgressBar';
import { SignatureModal } from '@/components/SignatureModal';
import { StepContainer } from '@/components/StepContainer';
import { UnitsSelector } from '@/components/UnitsSelector';
import { FORM_STEPS, TOTAL_STEPS } from '@/constants/checklists';
import { MAINTENANCE_TYPES, maintenanceLabel } from '@/constants/company';
import { getMachineTypeInfo } from '@/constants/machineTypes';
import { colors, fontSize, spacing } from '@/constants/theme';
import { getMachineById } from '@/db/repositories/machines';
import {
  ALARM_NOTE,
  addAttentionRow,
  addCustomChecklistItem,
  addMaterialRow,
  addPhoto,
  deletePhoto,
  getFullReport,
  getContractReports,
  lockReport,
  removeMaterialRow,
  saveSignature,
  syncMachineFromReport,
  updateAttentionNote,
  deleteChecklistItem,
  updateChecklistItem,
  updateMaterial,
  updatePhotoCaption,
  updateReport,
  updateReportUnits
} from '@/db/repositories/reports';
import { useReport } from '@/hooks/useReport';
import { exportReportPdf, sharePdf } from '@/services/pdfGenerator';
import { deletePicture, keepPicture } from '@/services/photos';
import { syncNow } from '@/services/webSync';
import { PressureUnit, TempUnit } from '@/types';
import { formatDate, hasValue, isReportLocked } from '@/utils/helpers';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

function MaterialRow({ mat, index, locked, onDelete, showDelete }: {
  mat: { id: string; description: string; qty: string; unit: string };
  index: number;
  locked: boolean;
  onDelete: () => void;
  showDelete: boolean;
}) {
  const [desc, setDesc] = useState(mat.description);
  const [qty, setQty] = useState(mat.qty);
  const [unit, setUnit] = useState(mat.unit ?? '');

  useEffect(() => { setDesc(mat.description); }, [mat.description]);
  useEffect(() => { setQty(mat.qty); }, [mat.qty]);
  useEffect(() => { setUnit(mat.unit ?? ''); }, [mat.unit]);

  return (
    <View style={styles.materialRow}>
      <FormField
        labelEn={`Material ${index + 1}`} labelAr={`مادة ${index + 1}`}
        value={desc}
        onChangeText={(v) => setDesc(v)}
        onDebouncedChange={(v) => updateMaterial(mat.id, v, qty, unit)}
        readOnly={locked} highlight={hasValue(desc)}
      />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <FormField
            labelEn="QTY" labelAr="الكمية"
            value={qty}
            onChangeText={(v) => setQty(v)}
            onDebouncedChange={(v) => updateMaterial(mat.id, desc, v, unit)}
            readOnly={locked}
          />
        </View>
        <View style={{ flex: 1 }}>
          <FormField
            labelEn="Unit" labelAr="الوحدة"
            value={unit}
            onChangeText={(v) => setUnit(v)}
            onDebouncedChange={(v) => updateMaterial(mat.id, desc, qty, v)}
            readOnly={locked}
          />
        </View>
      </View>
      {showDelete && (
        <Button title="حذف" icon="close" variant="danger" onPress={onDelete} />
      )}
    </View>
  );
}

function AttentionRow({ note, index, locked, onBlur }: {
  note: { id: string; unit_no: string; note: string };
  index: number;
  locked: boolean;
  onBlur: () => void;
}) {
  const [unitNo, setUnitNo] = useState(note.unit_no);
  const [noteText, setNoteText] = useState(note.note);
  const filled = hasValue(noteText);

  useEffect(() => { setUnitNo(note.unit_no); }, [note.unit_no]);
  useEffect(() => { setNoteText(note.note); }, [note.note]);

  return (
    <View style={[styles.attentionRow, filled && styles.highlightRow]}>
      <FormField
        labelEn={`Unit ${index + 1}`} labelAr={`وحدة ${index + 1}`}
        value={unitNo}
        onChangeText={(v) => setUnitNo(v)}
        onDebouncedChange={(v) => updateAttentionNote(note.id, v, noteText)}
        onBlur={onBlur}
        readOnly={locked}
      />
      <FormField
        labelEn="Note" labelAr="ملاحظة"
        value={noteText}
        onChangeText={(v) => setNoteText(v)}
        onDebouncedChange={(v) => updateAttentionNote(note.id, unitNo, v)}
        onBlur={onBlur}
        readOnly={locked} highlight={filled} multiline
      />
    </View>
  );
}

export default function ReportStepScreen() {
  const { id, step: stepParam } = useLocalSearchParams<{ id: string; step: string }>();
  const router = useRouter();
  const step = parseInt(stepParam ?? '1', 10);
  const { report, refresh } = useReport(id!);
  // back from the alarm list: show the alarm just added
  useFocusEffect(useCallback(() => refresh(), [refresh]));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showMaintenancePicker, setShowMaintenancePicker] = useState(false);
  const [customLabelEn, setCustomLabelEn] = useState('');
  const [customLabelAr, setCustomLabelAr] = useState('');
  const [brand, setBrand] = useState('');
  const [capacity, setCapacity] = useState('');
  const [location, setLocation] = useState('');
  const [installYear, setInstallYear] = useState('');
  const [exporting, setExporting] = useState(false);
  const [activeSig, setActiveSig] = useState<'technician' | 'client' | null>(null);

  const locked = report ? isReportLocked(report.status) : false;
  const stepInfo = FORM_STEPS.find((s) => s.step === step) ?? FORM_STEPS[0];
  const machineInfo = report ? getMachineTypeInfo(report.type) : null;

  const parsedDate = useMemo(() => {
    if (!report?.date) return new Date();
    const parts = report.date.split('-').map(Number);
    if (parts.length === 3) return new Date(parts[0], parts[1] - 1, parts[2]);
    return new Date();
  }, [report?.date]);

  // A report of a contract: the contract's other reports, to step from one unit's report to the next.
  const visit = useMemo(
    () =>
      report?.contract_id != null
        ? getContractReports(report.contract_id).sort((a, b) => a.unit_name.localeCompare(b.unit_name))
        : [],
    [report?.contract_id],
  );
  const visitAt = visit.findIndex((r) => r.id === id);
  const openVisit = () =>
    router.dismissTo({ pathname: '/visit', params: { contract: String(report?.contract_id ?? '') } } as never);

  useEffect(() => {
    if (report?.machine_id) {
      const machine = getMachineById(report.machine_id);
      if (machine) {
        setBrand(machine.brand);
        setCapacity(machine.capacity);
        setLocation(machine.location);
        setInstallYear(machine.installation_year);
      }
    }
  }, [report?.machine_id]);

  if (!report) {
    return (
      <View style={styles.loading}>
        <Text>جاري التحميل...</Text>
      </View>
    );
  }

  const saveDraft = () => {
    if (step === 2) {
      syncMachineFromReport(report, { brand, capacity, location, installation_year: installYear });
    }
    refresh();
    Alert.alert('تم الحفظ', 'تم حفظ المسودة بنجاح.');
  };

  const goNext = () => {
    if (step === 2) {
      syncMachineFromReport(report, { brand, capacity, location, installation_year: installYear });
    }
    if (step < TOTAL_STEPS) router.replace(`/report/${id}/${step + 1}`);
  };

  const goBack = () => {
    if (step > 1) router.replace(`/report/${id}/${step - 1}`);
    else router.back();
  };

  const pickLogo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      try {
        const old = report.logo_uri;
        updateReport(id!, { logo_uri: await keepPicture(result.assets[0].uri) });
        deletePicture(old);
        refresh();
      } catch (error) {
        Alert.alert('خطأ', error instanceof Error ? error.message : String(error));
      }
    }
  };

  const savePhoto = async (uri: string) => {
    try {
      addPhoto(id!, await keepPicture(uri));
      refresh();
    } catch (error) {
      Alert.alert('خطأ', error instanceof Error ? error.message : String(error));
    }
  };

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!result.canceled && result.assets[0]) await savePhoto(result.assets[0].uri);
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('تنبيه', 'مطلوب إذن الكاميرا.'); return; }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled && result.assets[0]) await savePhoto(result.assets[0].uri);
  };

  const handleLockAndExport = async () => {
    const full = getFullReport(id!);
    if (!full) return;
    const signed = (type: string) => full.signatures.some((s) => s.type === type && hasValue(s.image_base64));
    if (!signed('technician')) { Alert.alert('تنبيه', 'يجب توقيع الفني قبل قفل التقرير.'); return; }
    const noClient = signed('client') ? '' : '\n\nالعميل لم يوقّع: سيُقفل التقرير بدون توقيع العميل.';
    Alert.alert('قفل وتصدير', `سيتم قفل التقرير نهائياً.${noClient}\n\nمتابعة؟`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'قفل وتصدير PDF',
        onPress: async () => {
          setExporting(true);
          try {
            syncMachineFromReport(full, { brand, capacity, location, installation_year: installYear });
            lockReport(id!);
            const updated = getFullReport(id!)!;
            const pdfUri = await exportReportPdf(updated);
            await sharePdf(pdfUri);
            refresh();
            syncNow().catch(() => {}); // send it to the website now if there is a connection; otherwise it waits
          } catch {
            Alert.alert('خطأ', 'فشل تصدير PDF.');
          } finally {
            setExporting(false);
          }
        },
      },
    ]);
  };

  const handleUnitChange = (temp: TempUnit, pressure: PressureUnit) => {
    updateReportUnits(id!, temp, pressure);
    refresh();
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <>
            {locked && <LockedBadge />}
            <Pressable style={styles.logoPicker} onPress={pickLogo} disabled={locked}>
              {report.logo_uri
                ? <Image source={{ uri: report.logo_uri }} style={styles.logo} />
                : <Text style={styles.logoPlaceholder}>رفع شعار العلامة التجارية</Text>}
            </Pressable>
            <Pressable onPress={() => !locked && setShowDatePicker(true)} disabled={locked}>
              <FormField labelEn="Date" labelAr="التاريخ" value={report.date} editable={false} highlight />
            </Pressable>
            {showDatePicker && !locked && (
              <DateTimePicker
                value={parsedDate}
                mode="date"
                onChange={(_, date) => {
                  setShowDatePicker(Platform.OS === 'ios');
                  if (date) {
                    updateReport(id!, { date: formatDate(date) });
                    refresh();
                  }
                }}
              />
            )}
            <FormField
              labelEn="Client"
              labelAr="العميل"
              value={report.client}
              onDebouncedChange={(v) => { updateReport(id!, { client: v }); refresh(); }}
              readOnly={locked}
              highlight={hasValue(report.client)}
            />

            <FormField labelEn="Site" labelAr="الموقع"
              value={report.site}
              onDebouncedChange={(v) => { updateReport(id!, { site: v }); refresh(); }}
              readOnly={locked} highlight={hasValue(report.site)} />
            <Pressable onPress={() => !locked && setShowMaintenancePicker(true)} disabled={locked}>
              <FormField labelEn="Maintenance Type" labelAr="نوع الصيانة" value={maintenanceLabel(report.maintenance_type)} editable={false} highlight />
            </Pressable>
            <FormField labelEn="ASEE Technician" labelAr="الفني – المهندس"
              value={report.technician}
              onDebouncedChange={(v) => { updateReport(id!, { technician: v }); refresh(); }}
              readOnly={locked} highlight={hasValue(report.technician)} />
          </>
        );

      case 2:
        return (
          <>
            {locked && <LockedBadge />}
            <Text style={styles.machineType}>{machineInfo?.labelAr} — {machineInfo?.labelEn}</Text>
            <FormField labelEn="Brand" labelAr="العلامة" value={brand} onChangeText={setBrand} readOnly={locked} />
            <FormField labelEn="Model" labelAr="موديل المكينة"
              value={report.machine_model}
              onDebouncedChange={(v) => { updateReport(id!, { machine_model: v }); refresh(); }}
              readOnly={locked} highlight />

            <FormField labelEn="S/N No." labelAr="الرقم التسلسلي"
              value={report.serial_no}
              onDebouncedChange={(v) => { updateReport(id!, { serial_no: v }); refresh(); }}
              readOnly={locked} highlight />
            <FormField labelEn="Capacity" labelAr="السعة" value={capacity} onChangeText={setCapacity} readOnly={locked} />
            <FormField labelEn="Location on Site" labelAr="الموقع في الموقع" value={location} onChangeText={setLocation} readOnly={locked} />
            <FormField labelEn="Installation Year" labelAr="سنة التركيب" value={installYear} onChangeText={setInstallYear} readOnly={locked} keyboardType="number-pad" />
          </>
        );

      case 3:
        return (
          <>
            {locked && <LockedBadge />}
            <UnitsSelector
              tempUnit={report.temp_unit}
              pressureUnit={report.pressure_unit}
              onTempChange={(u) => handleUnitChange(u, report.pressure_unit)}
              onPressureChange={(u) => handleUnitChange(report.temp_unit, u)}
              readOnly={locked}
            />
            <ChecklistSection
              items={report.checklist_items}
              machineType={report.type}
              tempUnit={report.temp_unit}
              pressureUnit={report.pressure_unit}
              readOnly={locked}
              onUpdate={(itemId, value) => { updateChecklistItem(itemId, value); refresh(); }}
              onDelete={(itemId) => { deleteChecklistItem(itemId); refresh(); }}
            />
            {!locked && (
              <View style={styles.customSection}>
                <Text style={styles.customTitle}>إضافة صف مخصص</Text>
                <FormField labelEn="English" labelAr="إنجليزي" value={customLabelEn} onChangeText={setCustomLabelEn} />
                <FormField labelEn="Arabic" labelAr="عربي" value={customLabelAr} onChangeText={setCustomLabelAr} />
                <Button title="إضافة" variant="secondary" onPress={() => {
                  if (!customLabelEn.trim()) return;
                  addCustomChecklistItem(id!, customLabelEn.trim(), customLabelAr.trim() || customLabelEn.trim());
                  setCustomLabelEn(''); setCustomLabelAr(''); refresh();
                }} />
              </View>
            )}
          </>
        );

      case 4:
        return (
          <>
            {locked && <LockedBadge />}
            <Text style={styles.sectionTitle}>الصيانة المطلوبة / Work Performed</Text>
            <FormField value={report.required_maintenance}
              onDebouncedChange={(v) => { updateReport(id!, { required_maintenance: v }); refresh(); }}
              readOnly={locked} multiline numberOfLines={8} style={styles.textArea} />
          </>
        );

      case 5:
        return (
          <>
            {locked && <LockedBadge />}
            <Text style={styles.sectionTitle}>بحاجة إلى انتباه | Attention Needed</Text>
            {!locked && (
              <Button
                title="إضافة إنذار من القائمة / Add alarm"
                icon="bell"
                variant="accent"
                onPress={() => router.push({ pathname: '/alarms', params: { report: id! } })}
              />
            )}
            {report.attention_notes.map((note, index) => {
              const alarm = note.note.match(ALARM_NOTE)?.[1];
              return (
                <View key={note.id}>
                  <AttentionRow note={note} index={index} locked={locked} onBlur={refresh} />
                  {alarm ? (
                    <Pressable
                      style={styles.alarmLink}
                      accessibilityRole="link"
                      onPress={() => router.push({ pathname: '/alarms', params: locked ? { q: alarm } : { q: alarm, report: id! } })}>
                      <IconText icon="bell" text={`عرض الإنذار ${alarm} في القائمة`} color={colors.brand} />
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
            {!locked && (
              <Button title="+ إضافة صف" variant="secondary" onPress={() => { addAttentionRow(id!); refresh(); }} />
            )}
          </>
        );

      case 6:
        return (
          <>
            {locked && <LockedBadge />}
            <Text style={styles.sectionTitle}>المواد المستخدمة | Materials Used</Text>
            {report.materials.map((mat, index) => (
              <MaterialRow
                key={mat.id}
                mat={mat}
                index={index}
                locked={locked}
                onDelete={() => { removeMaterialRow(mat.id, id!); refresh(); }}
                showDelete={!locked && report.materials.length > 1}
              />
            ))}
            {!locked && (
              <Button title="إضافة مادة +" variant="secondary" onPress={() => { addMaterialRow(id!); refresh(); }} />
            )}
          </>
        );

      case 7:
        return (
          <>
            {locked && <LockedBadge />}
            <Text style={styles.sectionTitle}>الملاحظات | Notes</Text>
            <Text style={styles.visitNoteText}>لا تظهر في PDF العميل. تُرسل إلى الموقع فقط.</Text>
            <FormField value={report.general_notes}
              onDebouncedChange={(v) => { updateReport(id!, { general_notes: v }); refresh(); }}
              readOnly={locked} multiline numberOfLines={8} style={styles.textArea} />
          </>
        );

      case 8:
        return (
          <>
            {locked && <LockedBadge />}
            <Text style={styles.sectionTitle}>صور الموقع | Site Photos</Text>
            {!locked && (
              <View style={styles.photoActions}>
                <Button title="كاميرا" onPress={takePhoto} variant="primary" />
                <Button title="معرض" onPress={pickPhoto} variant="secondary" />
              </View>
            )}
            <View style={styles.photoGrid}>
              {report.photos.map((photo) => (
                <View key={photo.id} style={styles.photoItem}>
                  <Image source={{ uri: photo.uri }} style={styles.photo} />
                  <FormField
                    value={photo.caption}
                    onDebouncedChange={(v) => updatePhotoCaption(photo.id, v)}
                    onBlur={() => refresh()}
                    placeholder="تعليق..." readOnly={locked}
                  />
                  {!locked && (
                    <Button title="حذف" variant="danger" onPress={() => { deletePhoto(photo.id); refresh(); }} />
                  )}
                </View>
              ))}
            </View>
          </>
        );

      case 9:
        return (
          <>
            {locked && <LockedBadge />}
            {!locked && report.contract_id != null ? (
              <View style={styles.visitNote}>
                <Text style={styles.visitNoteText}>
                  هذا التقرير جزء من العقد {report.contract_number}. يوقّع الفني والعميل مرة واحدة لكل التقارير الجاهزة من صفحة العقد.
                </Text>
                <Button title="توقيع الكل من صفحة العقد" onPress={openVisit} variant="accent" />
                <Text style={styles.visitNoteText}>أو وقّع هذا التقرير وحده:</Text>
              </View>
            ) : null}
            <View style={styles.signatures}>
              <TouchableOpacity
                style={[styles.sigButton, report.signatures.find(s => s.type === 'technician') && styles.sigButtonDone]}
                onPress={() => !locked && setActiveSig('technician')}
                disabled={locked}
              >
                <View style={styles.sigButtonIcon}>
                  {report.signatures.find(s => s.type === 'technician')
                    ? <Icon name="check-circle" size={28} color={colors.success} />
                    : <Icon name="pen" size={28} color={colors.text} />}
                </View>
                <Text style={styles.sigButtonLabel}>توقيع الفني</Text>
                <Text style={styles.sigButtonLabelEn}>Technician Signature</Text>
                {report.signatures.find(s => s.type === 'technician') && (
                  <Text style={styles.sigButtonSub}>{report.technician}</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.sigButton, report.signatures.find(s => s.type === 'client') && styles.sigButtonDone]}
                onPress={() => !locked && setActiveSig('client')}
                disabled={locked}
              >
                <View style={styles.sigButtonIcon}>
                  {report.signatures.find(s => s.type === 'client')
                    ? <Icon name="check-circle" size={28} color={colors.success} />
                    : <Icon name="pen" size={28} color={colors.text} />}
                </View>
                <Text style={styles.sigButtonLabel}>توقيع العميل</Text>
                <Text style={styles.sigButtonLabelEn}>Customer Signature</Text>
                {report.signatures.find(s => s.type === 'client') && (
                  <Text style={styles.sigButtonSub}>{report.signatures.find(s => s.type === 'client')?.signer_name}</Text>
                )}
              </TouchableOpacity>
            </View>

            <SignatureModal
              type={activeSig}
              defaultName={
                report.signatures.find((s) => s.type === activeSig)?.signer_name ||
                (activeSig === 'technician' ? report.technician : '')
              }
              onClose={() => setActiveSig(null)}
              onSave={(sig, name) => {
                saveSignature(id!, activeSig!, sig, name, formatDate());
                refresh();
                setActiveSig(null);
              }}
            />

            {!locked && (
              <Button title="قفل وتصدير PDF" onPress={handleLockAndExport} variant="accent" loading={exporting} />
            )}
            {locked && (
              <Button title="تصدير PDF" onPress={async () => {
                setExporting(true);
                try {
                  const pdfUri = await exportReportPdf(report);
                  await sharePdf(pdfUri);
                } catch {
                  Alert.alert('خطأ', 'فشل تصدير PDF.');
                } finally { setExporting(false); }
              }} variant="accent" loading={exporting} />
            )}
          </>
        );

      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      {visit.length > 1 && visitAt >= 0 ? (
        <View style={styles.visitBar}>
          <Pressable
            style={styles.visitStep}
            disabled={visitAt === 0}
            onPress={() => router.replace(`/report/${visit[visitAt - 1].id}/${step}` as never)}>
            <Text style={[styles.visitStepText, visitAt === 0 && styles.visitStepOff]}>السابق</Text>
          </Pressable>
          <Pressable style={styles.visitName} onPress={openVisit}>
            <Text style={styles.visitNameText} numberOfLines={1}>
              {visit[visitAt].unit_name} ({visitAt + 1}/{visit.length})
            </Text>
            <Text style={styles.visitHint}>كل تقارير العقد</Text>
          </Pressable>
          <Pressable
            style={styles.visitStep}
            disabled={visitAt === visit.length - 1}
            onPress={() => router.replace(`/report/${visit[visitAt + 1].id}/${step}` as never)}>
            <Text style={[styles.visitStepText, visitAt === visit.length - 1 && styles.visitStepOff]}>التالي</Text>
          </Pressable>
        </View>
      ) : null}
      <ProgressBar currentStep={step} />
      <Text style={styles.stepTitle}>{stepInfo.titleAr} — {stepInfo.title}</Text>
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
        <StepContainer>{renderStep()}</StepContainer>
      </ScrollView>
      <View style={styles.navBar}>
        <Button title="رجوع" onPress={goBack} variant="secondary" />
        {!locked && <Button title="حفظ مسودة" onPress={saveDraft} variant="primary" />}
        {step < TOTAL_STEPS && <Button title="التالي" onPress={goNext} variant="accent" />}
      </View>
      <DropdownPicker
        visible={showMaintenancePicker}
        options={[...MAINTENANCE_TYPES]}
        selected={report.maintenance_type}
        onSelect={(v) => { updateReport(id!, { maintenance_type: v as typeof report.maintenance_type }); refresh(); }}
        onClose={() => setShowMaintenancePicker(false)}
        label={maintenanceLabel}
        title="نوع الصيانة"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  stepTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text, textAlign: 'center', paddingVertical: spacing.sm },
  scroll: { flex: 1 },
  navBar: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  logoPicker: { height: 80, borderWidth: 1, borderColor: colors.border, borderRadius: 10, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', marginBottom: spacing.md, backgroundColor: colors.surface },
  logo: { width: 120, height: 60, resizeMode: 'contain' },
  logoPlaceholder: { color: colors.textSecondary, fontSize: fontSize.sm },
  machineType: { fontSize: fontSize.md, color: colors.accent, fontWeight: '600', marginBottom: spacing.md, textAlign: 'center' },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text, marginBottom: spacing.sm, textAlign: 'right' },
  customSection: { marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  customTitle: { fontSize: fontSize.md, fontWeight: '600', marginBottom: spacing.sm, textAlign: 'right' },
  attentionRow: { marginBottom: spacing.sm },
  materialRow: { marginBottom: spacing.md },
  highlightRow: { backgroundColor: colors.rowHighlight, borderRadius: 8, padding: spacing.xs },
  textArea: { minHeight: 140, textAlignVertical: 'top' },
  photoActions: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  photoItem: { width: '47%' },
  photo: { width: '100%', height: 150, borderRadius: 8, marginBottom: spacing.xs },
  signatures: { flexDirection: 'row', gap: spacing.md },
  sigButton: { flex: 1, borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, marginBottom: spacing.md, padding: spacing.md, alignItems: 'center', gap: 4, backgroundColor: colors.surface },
  sigButtonDone: { borderColor: colors.accent },
  sigButtonIcon: { height: 34, justifyContent: 'center' },
  sigButtonLabel: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  sigButtonLabelEn: { fontSize: fontSize.sm, color: colors.textSecondary },
  sigButtonSub: { fontSize: fontSize.sm, color: colors.accent, marginTop: 2 },
  visitBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.accentLight, borderBottomWidth: 1, borderBottomColor: colors.border },
  visitStep: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  visitStepText: { fontSize: fontSize.md, fontWeight: '700', color: colors.brandDark },
  visitStepOff: { color: colors.border },
  visitName: { flex: 1, alignItems: 'center', paddingVertical: spacing.xs },
  visitNameText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  visitHint: { fontSize: fontSize.sm, color: colors.textSecondary },
  visitNote: { gap: spacing.sm, marginBottom: spacing.md },
  alarmLink: { alignSelf: 'flex-end', paddingVertical: spacing.xs, marginTop: -spacing.sm, marginBottom: spacing.sm },
  visitNoteText: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'right' },
});